import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/admin/workspaces/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createAdminClient() as any;
    const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
    if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const { data: ws, error } = await db
      .from('workspaces')
      .select('id, name, slug, plan, is_active, subscription_status, owner_email, owner_phone, created_at, deleted_at, custom_domain, phone_number_id, access_token, waba_id, onboarding_complete, settings')
      .eq('id', id)
      .single();

    if (error || !ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ workspace: ws });
  } catch (err) {
    console.error('[admin/workspaces/[id]/GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function hardDeleteWorkspace(db: any, workspaceId: string) {
  const { data: members } = await db
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId);

  const { error: wsError } = await db.from('workspaces').delete().eq('id', workspaceId);
  if (wsError) throw new Error('Failed to delete workspace');

  if (members?.length) {
    for (const member of members as Array<{ user_id: string }>) {
      const { count } = await db
        .from('workspace_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', member.user_id);
      if ((count ?? 0) === 0) {
        await db.auth.admin.deleteUser(member.user_id);
      }
    }
  }
}

// DELETE /api/admin/workspaces/:id
// ?permanent=true  → immediate hard delete (from trash)
// default          → soft delete (move to trash, auto-purged after 7 days)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createAdminClient() as any;
    const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
    if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id: workspaceId } = await params;

    if (permanent) {
      await hardDeleteWorkspace(db, workspaceId);
    } else {
      // Soft delete — move to trash
      const { error } = await db
        .from('workspaces')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', workspaceId);
      if (error) return NextResponse.json({ error: 'Failed to move to trash' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/workspaces/delete]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Get current user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Check is_platform_admin
    const db = createAdminClient() as any;
    const { data: profile } = await db
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();
    if (!profile?.is_platform_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json() as {
      restore?: boolean;
      plan?: string;
      is_active?: boolean;
      subscription_status?: string;
      custom_domain?: string | null;
      // WhatsApp credentials — admin can set on behalf of client
      phone_number_id?: string | null;
      access_token?: string | null;
      waba_id?: string | null;
      onboarding_complete?: boolean;
      // Partial settings JSONB merge (e.g. agent_persona, app_id)
      settings?: Record<string, unknown>;
    };

    // Restore from trash
    if (body.restore) {
      const { error } = await db.from('workspaces').update({ deleted_at: null }).eq('id', id);
      if (error) return NextResponse.json({ error: 'Failed to restore workspace' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const updateData: Record<string, unknown> = {};
    if (body.plan !== undefined) updateData.plan = body.plan;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.subscription_status !== undefined) {
      updateData.subscription_status = body.subscription_status;
      // Sync is_active based on subscription_status changes
      if (body.subscription_status === 'active') {
        updateData.is_active = true;
      }
      if (body.subscription_status === 'pending_approval' || body.subscription_status === 'halted') {
        updateData.is_active = false;
      }
    }
    if ('custom_domain' in body) updateData.custom_domain = body.custom_domain ?? null;
    // WhatsApp credentials — allows admin to configure client without requiring onboarding
    if ('phone_number_id' in body) updateData.phone_number_id = body.phone_number_id ?? null;
    if ('access_token' in body)    updateData.access_token    = body.access_token    ?? null;
    if ('waba_id' in body)         updateData.waba_id         = body.waba_id         ?? null;
    if (body.onboarding_complete !== undefined) updateData.onboarding_complete = body.onboarding_complete;
    // Merge settings JSONB — never wipes existing keys
    if (body.settings && typeof body.settings === 'object') {
      const { data: existing } = await db.from('workspaces').select('settings').eq('id', id).single();
      const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;
      updateData.settings = { ...existingSettings, ...body.settings };
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await db
      .from('workspaces')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[admin/workspaces/[id]] update error:', error);
      return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/workspaces/[id]] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

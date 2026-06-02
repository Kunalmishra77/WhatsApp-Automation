import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

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
      plan?: string;
      is_active?: boolean;
      subscription_status?: string;
      custom_domain?: string | null;
    };

    const updateData: Record<string, unknown> = {};
    if (body.plan !== undefined) updateData.plan = body.plan;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.subscription_status !== undefined) updateData.subscription_status = body.subscription_status;
    if ('custom_domain' in body) updateData.custom_domain = body.custom_domain ?? null;

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

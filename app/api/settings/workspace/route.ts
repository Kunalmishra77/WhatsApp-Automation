import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import type { Json } from '@/types/database.types';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('workspaces')
      .select('id, name, slug, plan, settings')
      .eq('id', workspaceId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Mask razorpay secret if present
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    const safeSettings = { ...settings };
    if (safeSettings.razorpay_key_secret) {
      safeSettings.razorpay_key_secret = '••••••••';
    }

    return NextResponse.json({ workspace: { ...data, settings: safeSettings } });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Settings/Workspace GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      settings?: Record<string, unknown>;
    };

    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    if (!body.settings || typeof body.settings !== 'object') {
      return NextResponse.json({ error: 'settings object required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const db = supabase as any;

    // Merge settings with existing to avoid overwriting unrelated keys
    const { data: existing } = await db
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();

    const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;

    // If incoming razorpay_key_secret is masked, preserve existing
    const incoming = { ...body.settings };
    if (incoming.razorpay_key_secret === '••••••••') {
      delete incoming.razorpay_key_secret;
    }

    const merged = { ...existingSettings, ...incoming } as Json;

    const { error } = await db
      .from('workspaces')
      .update({ settings: merged, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Settings/Workspace PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

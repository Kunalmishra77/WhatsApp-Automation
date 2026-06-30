import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { ALL_AGENT_PAGE_KEYS, DEFAULT_AGENT_ALLOWED_PAGES } from '@/lib/agent-pages';

// GET /api/team/page-access?workspaceId=
// Returns just the agent_page_access array — any authenticated workspace member
// can call this (Sidebar/page guards need it for every role, not just admins).
// Deliberately scoped to this one field rather than exposing workspaces.settings
// wholesale, since that JSONB blob also holds secrets like razorpay_key_secret.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    // Any workspace member may read this — it's visibility config, not a secret.
    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data } = await db.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const raw = settings.agent_page_access as string[] | undefined;
    const agentPageAccess = Array.isArray(raw)
      ? raw.filter((k) => ALL_AGENT_PAGE_KEYS.includes(k as never))
      : DEFAULT_AGENT_ALLOWED_PAGES;

    return NextResponse.json({ agentPageAccess });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[PageAccess GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/team/page-access
// Body: { workspaceId, agentPageAccess: string[] }
export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId, agentPageAccess } = await request.json() as {
      workspaceId?: string; agentPageAccess?: string[];
    };
    if (!workspaceId || !Array.isArray(agentPageAccess)) {
      return NextResponse.json({ error: 'workspaceId and agentPageAccess array required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_team');

    const validated = agentPageAccess.filter((k) => ALL_AGENT_PAGE_KEYS.includes(k as never));

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data: existing } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;

    const { error } = await db
      .from('workspaces')
      .update({ settings: { ...existingSettings, agent_page_access: validated } })
      .eq('id', workspaceId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, agentPageAccess: validated });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[PageAccess PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

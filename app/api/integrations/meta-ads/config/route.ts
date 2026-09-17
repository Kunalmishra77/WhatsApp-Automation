import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/integrations/meta-ads/config?workspaceId= — current ad account id + last sync.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = (ws?.settings ?? {}) as Record<string, unknown>;
    const { count } = await db
      .from('meta_ad_spend_daily')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    return NextResponse.json({
      adAccountId: (settings.meta_ad_account_id as string | undefined) ?? '',
      hasData: (count ?? 0) > 0,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/integrations/meta-ads/config  Body: { workspaceId, adAccountId }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, adAccountId } = await request.json() as { workspaceId?: string; adAccountId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = (ws?.settings ?? {}) as Record<string, unknown>;
    const cleaned = (adAccountId ?? '').trim().replace(/^act_/, '') || null;

    await db.from('workspaces')
      .update({ settings: { ...settings, meta_ad_account_id: cleaned } })
      .eq('id', workspaceId);

    return NextResponse.json({ success: true, adAccountId: cleaned ?? '' });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/campaigns/list?workspaceId=xxx
// Returns campaigns with live stats aggregated from campaign_recipients
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // Fetch campaigns with aggregate columns from campaigns table (always up-to-date)
    const { data: campaigns, error } = await db
      .from('campaigns')
      .select('*, templates(name, body)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Use campaigns table aggregate columns directly — avoids the 1000-row Supabase default
    // limit that was causing the old live-scan approach to return wrong counts.
    // Campaign executor and manual updates keep these columns accurate.
    const result = (campaigns ?? []).map((c: any) => ({
      ...c,
      live_total:     c.total_recipients ?? 0,
      live_sent:      c.total_recipients ?? 0,   // sent = total contacts attempted
      live_delivered: c.delivered_count  ?? 0,
      live_read:      c.read_count       ?? 0,
      live_replied:   0,
      live_failed:    c.failed_count     ?? 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaigns List]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

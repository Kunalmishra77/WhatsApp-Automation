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

    // Fetch campaigns
    const { data: campaigns, error } = await db
      .from('campaigns')
      .select('*, templates(name, body)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch all recipient status counts per campaign in one query
    const { data: recipientRows } = await db
      .from('campaign_recipients')
      .select('campaign_id, status')
      .eq('workspace_id', workspaceId);

    // Build per-campaign stats map from campaign_recipients
    const statsMap = new Map<string, { total: number; sent: number; delivered: number; read: number; replied: number; failed: number }>();

    for (const r of (recipientRows ?? []) as Array<{ campaign_id: string; status: string }>) {
      const s  = r.status;
      const id = r.campaign_id;
      if (!statsMap.has(id)) statsMap.set(id, { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
      const m = statsMap.get(id)!;
      m.total++;
      if (['sent', 'delivered', 'read', 'replied'].includes(s)) m.sent++;
      if (['delivered', 'read', 'replied'].includes(s))         m.delivered++;
      if (['read', 'replied'].includes(s))                      m.read++;
      if (s === 'replied') m.replied++;
      if (s === 'failed')  m.failed++;
    }

    // Merge live stats into campaigns
    const result = (campaigns ?? []).map((c: any) => {
      const live = statsMap.get(c.id);
      return {
        ...c,
        // If campaign_recipients data exists, use it; otherwise fall back to campaigns columns
        live_total:     live?.total     ?? c.total_recipients  ?? 0,
        live_sent:      live?.sent      ?? c.sent_count        ?? 0,
        live_delivered: live?.delivered ?? c.delivered_count   ?? 0,
        live_read:      live?.read      ?? c.read_count        ?? 0,
        live_replied:   live?.replied   ?? 0,
        live_failed:    live?.failed    ?? c.failed_count      ?? 0,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaigns List]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

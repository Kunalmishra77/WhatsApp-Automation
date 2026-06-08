import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/ai/revenue/insights?workspaceId=xxx
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // Hot leads — top 20 by score, with contact info
    const { data: hotLeads } = await db
      .from('contact_insights')
      .select(`
        lead_score, hot_lead, buy_signals, best_send_hour, insights_summary, last_analyzed_at,
        contacts!contact_insights_contact_id_fkey(id, name, phone, lifecycle_stage, is_vip)
      `)
      .eq('workspace_id', workspaceId)
      .gte('lead_score', 50)
      .order('lead_score', { ascending: false })
      .limit(20);

    // Summary stats
    const { data: stats } = await db
      .from('contact_insights')
      .select('lead_score, hot_lead, best_send_hour')
      .eq('workspace_id', workspaceId);

    const rows = (stats ?? []) as Array<{ lead_score: number; hot_lead: boolean; best_send_hour: number | null }>;
    const totalAnalyzed   = rows.length;
    const totalHotLeads   = rows.filter((r) => r.hot_lead).length;
    const avgScore        = totalAnalyzed
      ? Math.round(rows.reduce((s, r) => s + r.lead_score, 0) / totalAnalyzed)
      : 0;

    // Best global send hour (most common peak hour across contacts)
    const hourVotes = Array(24).fill(0) as number[];
    for (const r of rows) {
      if (r.best_send_hour !== null) { const v = hourVotes[r.best_send_hour]; if (v !== undefined) hourVotes[r.best_send_hour] = v + 1; }
    }
    const bestGlobalHour = hourVotes.some((v) => v > 0)
      ? hourVotes.indexOf(Math.max(...hourVotes))
      : null;

    // Last analyzed timestamp
    const { data: lastRun } = await db
      .from('contact_insights')
      .select('last_analyzed_at')
      .eq('workspace_id', workspaceId)
      .order('last_analyzed_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      summary: {
        total_analyzed:  totalAnalyzed,
        total_hot_leads: totalHotLeads,
        avg_score:       avgScore,
        best_global_hour: bestGlobalHour,
        last_analyzed_at: lastRun?.last_analyzed_at ?? null,
      },
      hot_leads: hotLeads ?? [],
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Revenue Insights] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

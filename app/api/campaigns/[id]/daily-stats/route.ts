import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export interface DailyStatRow {
  date:      string;   // 'YYYY-MM-DD'
  sent:      number;
  delivered: number;
  read:      number;
  replied:   number;
  failed:    number;
}

// GET /api/campaigns/[id]/daily-stats?workspaceId=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');
    const db = createAdminClient() as any;

    // Fetch all timestamp columns for this campaign
    const { data: rows } = await db
      .from('campaign_recipients')
      .select('status, sent_at, delivered_at, read_at, replied_at')
      .eq('campaign_id', campaignId);

    if (!rows?.length) return NextResponse.json({ daily: [] });

    // Aggregate by date across all timestamp columns
    const dayMap: Record<string, DailyStatRow> = {};

    const getDay = (iso: string | null) => iso ? iso.slice(0, 10) : null;

    const ensure = (date: string) => {
      if (!dayMap[date]) dayMap[date] = { date, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
      return dayMap[date];
    };

    for (const r of rows as Array<{ status: string; sent_at: string | null; delivered_at: string | null; read_at: string | null; replied_at: string | null }>) {
      if (r.sent_at)      { const d = getDay(r.sent_at);      if (d) ensure(d).sent++; }
      if (r.delivered_at) { const d = getDay(r.delivered_at); if (d) ensure(d).delivered++; }
      if (r.read_at)      { const d = getDay(r.read_at);      if (d) ensure(d).read++; }
      if (r.replied_at)   { const d = getDay(r.replied_at);   if (d) ensure(d).replied++; }
      if (r.status === 'failed' && r.sent_at) {
        const d = getDay(r.sent_at); if (d) ensure(d).failed++;
      }
    }

    const daily = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ daily });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign DailyStats]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export interface DailyStatRow {
  date:      string;   // 'YYYY-MM-DD' (IST)
  sent:      number;
  delivered: number;
  read:      number;
  replied:   number;
  failed:    number;
}

// IST calendar date for a timestamptz ISO string — matches every other analytics
// endpoint (Asia/Kolkata), so day buckets line up with the dashboard and Conversations.
function istDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
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

    // Ownership: the campaign must belong to the authorized workspace. Without this,
    // a member of workspace A could read workspace B's campaign by passing its id.
    const { data: camp } = await db
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!camp) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    // Paginate — PostgREST caps an unbounded select at 1000 rows, which would silently
    // truncate the chart (and drop trailing days) for any campaign with >1000 recipients.
    const rows: Array<{ status: string; sent_at: string | null; delivered_at: string | null; read_at: string | null; replied_at: string | null }> = [];
    let offset = 0;
    while (true) {
      const { data: page } = await db
        .from('campaign_recipients')
        .select('status, sent_at, delivered_at, read_at, replied_at')
        .eq('campaign_id', campaignId)
        .range(offset, offset + 999);
      if (!page?.length) break;
      rows.push(...page);
      if (page.length < 1000) break;
      offset += 1000;
    }

    if (!rows.length) return NextResponse.json({ daily: [] });

    // Aggregate by IST date across all timestamp columns
    const dayMap: Record<string, DailyStatRow> = {};
    const ensure = (date: string) => {
      if (!dayMap[date]) dayMap[date] = { date, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
      return dayMap[date];
    };

    for (const r of rows) {
      let d: string | null;
      if (r.sent_at)      { d = istDay(r.sent_at);      if (d) ensure(d).sent++; }
      if (r.delivered_at) { d = istDay(r.delivered_at); if (d) ensure(d).delivered++; }
      if (r.read_at)      { d = istDay(r.read_at);      if (d) ensure(d).read++; }
      if (r.replied_at)   { d = istDay(r.replied_at);   if (d) ensure(d).replied++; }
      if (r.status === 'failed' && r.sent_at) {
        d = istDay(r.sent_at); if (d) ensure(d).failed++;
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

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const runtime = 'nodejs';

// GET /api/local-rank?workspaceId=...
// Returns each tracked keyword with its latest rank and a short history.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const configured = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());

    const { data: keywords } = await db
      .from('local_rank_keywords')
      .select('id, keyword, area, place_id, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    const kwList = (keywords ?? []) as Array<{ id: string; keyword: string; area: string | null; place_id: string | null; created_at: string }>;

    // Pull recent snapshots for all keywords in one query.
    const ids = kwList.map((k) => k.id);
    let snapshots: Array<{ keyword_id: string; checked_on: string; rank: number | null; found: boolean; top_result: string | null }> = [];
    if (ids.length > 0) {
      const { data: snaps } = await db
        .from('local_rank_snapshots')
        .select('keyword_id, checked_on, rank, found, top_result')
        .in('keyword_id', ids)
        .order('checked_on', { ascending: false });
      snapshots = (snaps ?? []) as typeof snapshots;
    }

    const byKeyword = kwList.map((k) => {
      const history = snapshots
        .filter((s) => s.keyword_id === k.id)
        .slice(0, 30)
        .map((s) => ({ date: s.checked_on, rank: s.rank, found: s.found }));
      const latest = history[0] ?? null;
      const previous = history[1] ?? null;
      return {
        id: k.id,
        keyword: k.keyword,
        area: k.area,
        resolved: Boolean(k.place_id),
        currentRank: latest?.rank ?? null,
        found: latest?.found ?? false,
        previousRank: previous?.rank ?? null,
        checkedOn: latest?.date ?? null,
        history: history.slice().reverse(), // oldest → newest for a chart
      };
    });

    return NextResponse.json({ configured, keywords: byKeyword });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[LocalRank GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

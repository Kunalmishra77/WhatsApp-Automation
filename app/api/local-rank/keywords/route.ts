import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { resolveTargetPlace, checkKeywordRank } from '@/lib/local-rank';

export const runtime = 'nodejs';

// POST /api/local-rank/keywords  Body: { workspaceId, keyword, area? }
// Adds a keyword, resolves the business's Google place (for matching), and runs
// an immediate first check so the user sees a rank right away.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, keyword, area } = await request.json() as {
      workspaceId?: string; keyword?: string; area?: string;
    };
    if (!workspaceId || !keyword?.trim()) {
      return NextResponse.json({ error: 'workspaceId and keyword required' }, { status: 400 });
    }
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
      return NextResponse.json({ error: 'Places API key not configured' }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('name').eq('id', workspaceId).single();
    const businessName: string = (ws?.name as string | undefined)?.trim() || '';

    // Resolve the target business listing → place_id + location for rank matching.
    const area2 = area?.trim() || '';
    const target = await resolveTargetPlace([businessName, area2].filter(Boolean).join(', ') || businessName);

    const { data: inserted, error } = await db
      .from('local_rank_keywords')
      .insert({
        workspace_id: workspaceId,
        keyword: keyword.trim(),
        area: area2 || null,
        place_id: target?.id ?? null,
        location_lat: target?.lat ?? null,
        location_lng: target?.lng ?? null,
      })
      .select('id, workspace_id, keyword, area, place_id, location_lat, location_lng')
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That keyword is already tracked' }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Immediate first check (fail-soft — the keyword is saved regardless).
    let first: Awaited<ReturnType<typeof checkKeywordRank>> = null;
    try { first = await checkKeywordRank(db, inserted); } catch { /* ignore */ }

    return NextResponse.json({
      id: inserted.id,
      resolved: Boolean(target?.id),
      rank: first?.rank ?? null,
      found: first?.found ?? false,
    });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[LocalRank keyword POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/local-rank/keywords?workspaceId=...&id=...
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const id = request.nextUrl.searchParams.get('id');
    if (!workspaceId || !id) return NextResponse.json({ error: 'workspaceId and id required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { error } = await db.from('local_rank_keywords').delete().eq('id', id).eq('workspace_id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[LocalRank keyword DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

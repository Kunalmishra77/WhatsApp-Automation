import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { findBusinessCandidates, getWorkspacePlace, type ChosenPlace } from '@/lib/local-rank';

export const runtime = 'nodejs';

// GET /api/local-rank/business?workspaceId=...        → the chosen listing
// GET /api/local-rank/business?workspaceId=...&q=...   → candidates to choose from
//
// Which listing a workspace tracks is a decision the operator makes once, not
// something to infer: the top Places hit for a business name is routinely a
// similarly named business in another city, and binding to it reports a rank for
// a company the client has never heard of.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_local_rank');
    const db = createAdminClient() as any;

    if (!q) {
      return NextResponse.json({ chosen: await getWorkspacePlace(db, workspaceId) });
    }

    const res = await findBusinessCandidates(q);
    if (!res.ok) {
      const status = res.error === 'not_configured' ? 400 : 502;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ candidates: res.places });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[LocalRank business GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/local-rank/business
// Body: { workspaceId, place: { id, name, address, lat, lng } }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, place } = await request.json() as {
      workspaceId?: string; place?: ChosenPlace;
    };
    if (!workspaceId || !place?.id) {
      return NextResponse.json({ error: 'workspaceId and place required' }, { status: 400 });
    }
    await requireWorkspacePermission(workspaceId, 'manage_local_rank');

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = { ...((ws?.settings ?? {}) as Record<string, unknown>) };
    settings.local_rank_place = {
      id: place.id,
      name: place.name ?? '',
      address: place.address ?? '',
      lat: place.lat ?? null,
      lng: place.lng ?? null,
    };
    await db.from('workspaces').update({ settings }).eq('id', workspaceId);

    // Keywords added before this point carry the old target. Repointing them
    // keeps every row measuring the same business; leaving them would mix two
    // businesses in one table with nothing on screen to say so.
    await db.from('local_rank_keywords')
      .update({ place_id: place.id, location_lat: place.lat ?? null, location_lng: place.lng ?? null })
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[LocalRank business POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

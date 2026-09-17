// lib/local-rank.ts
// Local rank tracker: run a Google Places Text Search (New) for a keyword,
// biased to the business's area, and record where the business's own listing
// ranks in the results. Uses the simple GOOGLE_PLACES_API_KEY (no OAuth).

const PLACES = 'https://places.googleapis.com/v1';

export interface RankedPlace {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

type Bias = { lat: number; lng: number; radiusMeters?: number };

// Ordered list of places for a query (up to 20), optionally biased to a point.
export async function searchRankedPlaces(
  textQuery: string,
  bias?: Bias,
): Promise<{ ok: true; places: RankedPlace[] } | { ok: false; error: string }> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return { ok: false, error: 'not_configured' };
  try {
    const body: Record<string, unknown> = {
      textQuery,
      maxResultCount: 20,
      languageCode: 'en',
      regionCode: 'IN',
    };
    if (bias) {
      body.locationBias = {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: bias.radiusMeters ?? 15000,
        },
      };
    }
    const res = await fetch(`${PLACES}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `places ${res.status}: ${await res.text()}` };
    const data = await res.json() as {
      places?: Array<{ id?: string; displayName?: { text?: string }; location?: { latitude?: number; longitude?: number } }>;
    };
    const places: RankedPlace[] = (data.places ?? [])
      .filter((p) => p.id)
      .map((p) => ({
        id: p.id!,
        name: p.displayName?.text ?? '',
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      }));
    return { ok: true, places };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

// Resolve the target business's place id + location from a name (+ area).
export async function resolveTargetPlace(query: string): Promise<RankedPlace | null> {
  const res = await searchRankedPlaces(query);
  if (!res.ok) return null;
  return res.places[0] ?? null;
}

interface KeywordRow {
  id: string;
  workspace_id: string;
  keyword: string;
  area: string | null;
  place_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
}

// Runs a rank check for one keyword and upserts today's snapshot.
// Returns { rank, found } or null on a search failure.
export async function checkKeywordRank(
  db: any,
  kw: KeywordRow,
): Promise<{ rank: number | null; found: boolean; top: string | null } | null> {
  const query = kw.area ? `${kw.keyword} ${kw.area}` : kw.keyword;
  const bias = kw.location_lat != null && kw.location_lng != null
    ? { lat: kw.location_lat, lng: kw.location_lng }
    : undefined;

  const res = await searchRankedPlaces(query, bias);
  if (!res.ok) return null;

  const idx = kw.place_id
    ? res.places.findIndex((p) => p.id === kw.place_id)
    : -1;
  const rank = idx >= 0 ? idx + 1 : null;
  const found = rank !== null;
  const top = res.places[0]?.name ?? null;

  const today = new Date(Date.now()).toISOString().slice(0, 10);
  await db.from('local_rank_snapshots').upsert({
    workspace_id: kw.workspace_id,
    keyword_id: kw.id,
    checked_on: today,
    rank,
    found,
    top_result: top,
  }, { onConflict: 'keyword_id,checked_on' });

  return { rank, found, top };
}

// Runs rank checks for every keyword in a workspace.
export async function runWorkspaceRankCheck(db: any, workspaceId: string): Promise<{ checked: number }> {
  const { data: keywords } = await db
    .from('local_rank_keywords')
    .select('id, workspace_id, keyword, area, place_id, location_lat, location_lng')
    .eq('workspace_id', workspaceId);

  let checked = 0;
  for (const kw of (keywords ?? []) as KeywordRow[]) {
    const r = await checkKeywordRank(db, kw);
    if (r) checked += 1;
  }
  return { checked };
}

// lib/gbp-sync.ts
// Phase 2 — pull a workspace's Google Business Profile data (locations, reviews,
// Q&A, insights) and upsert it into our tables. Fail-soft per step/location so
// one bad location never aborts the whole sync. New reviews/questions also drop
// a `gbp` touchpoint into the Phase 1 Unified Lead Hub.

import {
  refreshAccessToken, listAccounts, listLocations, listReviews, listQuestions,
  getPerformanceMetrics, starRatingToInt, type GbpLocation,
} from '@/lib/google-business';
import { recordTouchpoint } from '@/lib/lead-touchpoint';

const idOf = (resourceName: string | undefined): string =>
  (resourceName ?? '').split('/').pop() ?? '';

/**
 * Resolve a fresh access token + Google account id for a workspace's GBP
 * connection. Used by the write endpoints (reply/answer/publish).
 * Returns null on any failure (caller responds 400).
 */
export async function getWorkspaceGbpAuth(
  db: any, workspaceId: string,
): Promise<{ accessToken: string; accountId: string } | null> {
  const { data: conn } = await db
    .from('gbp_connections')
    .select('refresh_token, google_account_id')
    .eq('workspace_id', workspaceId)
    .single();
  if (!conn?.refresh_token) return null;
  const accessToken = await refreshAccessToken(conn.refresh_token);
  if (!accessToken) return null;
  let accountId = conn.google_account_id as string | null;
  if (!accountId) {
    const accts = await listAccounts(accessToken);
    if (accts.ok) accountId = idOf(accts.data.accounts?.[0]?.name);
    if (accountId) await db.from('gbp_connections').update({ google_account_id: accountId }).eq('workspace_id', workspaceId);
  }
  if (!accountId) return null;
  return { accessToken, accountId };
}

const flatAddress = (loc: GbpLocation): string | null => {
  const a = loc.storefrontAddress;
  if (!a) return null;
  return [...(a.addressLines ?? []), a.locality, a.administrativeArea, a.postalCode]
    .filter(Boolean).join(', ') || null;
};

const INSIGHT_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_DIRECTION_REQUESTS',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_CONVERSATIONS',
];

export interface GbpSyncResult {
  ok: boolean;
  locations: number;
  reviews: number;
  questions: number;
  error?: string;
}

export async function syncWorkspaceGbp(db: any, workspaceId: string): Promise<GbpSyncResult> {
  const result: GbpSyncResult = { ok: false, locations: 0, reviews: 0, questions: 0 };
  try {
    const { data: conn } = await db
      .from('gbp_connections')
      .select('id, refresh_token, google_account_id')
      .eq('workspace_id', workspaceId)
      .single();
    if (!conn?.refresh_token) { result.error = 'not_connected'; return result; }

    const accessToken = await refreshAccessToken(conn.refresh_token);
    if (!accessToken) {
      await db.from('gbp_connections').update({ status: 'error' }).eq('id', conn.id);
      result.error = 'token_refresh_failed';
      return result;
    }

    // Resolve the account id (stored, else the first account).
    let accountId = conn.google_account_id as string | null;
    if (!accountId) {
      const accts = await listAccounts(accessToken);
      if (accts.ok) accountId = idOf(accts.data.accounts?.[0]?.name);
      if (accountId) await db.from('gbp_connections').update({ google_account_id: accountId }).eq('id', conn.id);
    }
    if (!accountId) { result.error = 'no_account'; return result; }

    // ── Locations ──────────────────────────────────────────────────────────
    const locsRes = await listLocations(accessToken, `accounts/${accountId}`);
    if (!locsRes.ok) { result.error = locsRes.error; return result; }
    const locations = locsRes.data.locations ?? [];

    for (const loc of locations) {
      const locationId = idOf(loc.name);
      if (!locationId) continue;
      result.locations += 1;

      await db.from('gbp_locations').upsert({
        workspace_id: workspaceId,
        connection_id: conn.id,
        location_id: locationId,
        title: loc.title ?? null,
        address: flatAddress(loc),
        primary_phone: loc.phoneNumbers?.primaryPhone ?? null,
        website_uri: loc.websiteUri ?? null,
        raw: loc,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,location_id' });

      // ── Reviews ────────────────────────────────────────────────────────
      const revRes = await listReviews(accessToken, accountId, locationId);
      if (revRes.ok) {
        for (const r of revRes.data.reviews ?? []) {
          const reviewId = r.reviewId || idOf(r.name);
          if (!reviewId) continue;
          const { data: existing } = await db
            .from('gbp_reviews')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('review_id', reviewId)
            .maybeSingle();

          await db.from('gbp_reviews').upsert({
            workspace_id: workspaceId,
            location_id: locationId,
            review_id: reviewId,
            reviewer_name: r.reviewer?.displayName ?? null,
            reviewer_photo_url: r.reviewer?.profilePhotoUrl ?? null,
            star_rating: starRatingToInt(r.starRating),
            comment: r.comment ?? null,
            create_time: r.createTime ?? null,
            update_time: r.updateTime ?? null,
            reply_comment: r.reviewReply?.comment ?? null,
            reply_update_time: r.reviewReply?.updateTime ?? null,
            reply_status: r.reviewReply?.comment ? 'posted' : 'none',
            raw: r,
          }, { onConflict: 'workspace_id,review_id' });

          result.reviews += 1;
          if (!existing) {
            void recordTouchpoint(db, {
              workspaceId,
              channel: 'gbp',
              sourceDetail: `Review — ${r.reviewer?.displayName ?? 'Customer'}`,
              refType: 'gbp_review',
              refId: reviewId,
              occurredAt: r.createTime ?? undefined,
              metadata: { location_id: locationId, star_rating: starRatingToInt(r.starRating) },
            });
          }
        }
      }

      // ── Q&A ────────────────────────────────────────────────────────────
      const qRes = await listQuestions(accessToken, locationId);
      if (qRes.ok) {
        for (const q of qRes.data.questions ?? []) {
          const questionId = idOf(q.name);
          if (!questionId) continue;
          await db.from('gbp_questions').upsert({
            workspace_id: workspaceId,
            location_id: locationId,
            question_id: questionId,
            author_name: q.author?.displayName ?? null,
            text: q.text ?? null,
            create_time: q.createTime ?? null,
            answer_text: q.topAnswers?.[0]?.text ?? null,
            answer_status: q.topAnswers?.[0]?.text ? 'posted' : 'none',
            raw: q,
          }, { onConflict: 'workspace_id,question_id' });
          result.questions += 1;
        }
      }

      // ── Insights (last 30 days) ────────────────────────────────────────
      await syncLocationInsights(db, workspaceId, locationId, accessToken);
    }

    await db.from('gbp_connections')
      .update({ last_synced_at: new Date().toISOString(), status: 'connected' })
      .eq('id', conn.id);

    result.ok = true;
    return result;
  } catch (err) {
    console.error('[GBP sync] error:', err);
    result.error = err instanceof Error ? err.message : 'sync_failed';
    return result;
  }
}

async function syncLocationInsights(db: any, workspaceId: string, locationId: string, accessToken: string) {
  try {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const res = await getPerformanceMetrics(accessToken, locationId, INSIGHT_METRICS, {
      startYear: start.getUTCFullYear(), startMonth: start.getUTCMonth() + 1, startDay: start.getUTCDate(),
      endYear: end.getUTCFullYear(), endMonth: end.getUTCMonth() + 1, endDay: end.getUTCDate(),
    });
    if (!res.ok) return;

    const rows: Array<{ workspace_id: string; location_id: string; date: string; metric: string; value: number }> = [];
    for (const series of res.data.multiDailyMetricTimeSeries ?? []) {
      for (const dm of series.dailyMetricTimeSeries ?? []) {
        const metric = dm.dailyMetric ?? 'UNKNOWN';
        for (const dv of dm.timeSeries?.datedValues ?? []) {
          if (!dv.date) continue;
          const date = `${dv.date.year}-${String(dv.date.month).padStart(2, '0')}-${String(dv.date.day).padStart(2, '0')}`;
          rows.push({ workspace_id: workspaceId, location_id: locationId, date, metric, value: Number(dv.value ?? 0) });
        }
      }
    }
    if (rows.length > 0) {
      await db.from('gbp_insights_daily').upsert(rows, { onConflict: 'workspace_id,location_id,date,metric' });
    }
  } catch (err) {
    console.error('[GBP insights] error:', err);
  }
}

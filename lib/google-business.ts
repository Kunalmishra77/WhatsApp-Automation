// lib/google-business.ts
// Google Business Profile (GBP) API client — OAuth 2.0 per workspace, scope
// `business.manage`. Mirrors lib/google-calendar.ts (same OAuth app / client
// credentials). Every call is fail-soft: it returns { ok, data | error } and
// never throws into the caller, so a GBP hiccup can never break the app.

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ACCOUNT_MGMT   = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFO  = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const MYBUSINESS_V4  = 'https://mybusiness.googleapis.com/v4';       // reviews + local posts
const QANDA          = 'https://mybusinessqanda.googleapis.com/v1';
const PERFORMANCE    = 'https://businessprofileperformance.googleapis.com/v1';

export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';

export type GbpResult<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): GbpResult<T> { return { ok: true, data }; }
function fail<T>(error: string): GbpResult<T> { return { ok: false, error }; }

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

function getClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/integrations/gbp/callback`;
  return { clientId, clientSecret, redirectUri };
}

// ── OAuth ────────────────────────────────────────────────────────────────────
export function getGbpOAuthUrl(workspaceId: string): string {
  const { clientId, redirectUri } = getClientCredentials();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GBP_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: workspaceId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getClientCredentials();
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const { clientId, clientSecret } = getClientCredentials();
    if (!clientId || !clientSecret) return null;
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: clientId,
        client_secret: clientSecret, grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) { console.error('[GBP] refresh failed:', await res.text()); return null; }
    const data = await res.json() as TokenResponse;
    return data.access_token ?? null;
  } catch (err) {
    console.error('[GBP] refreshAccessToken error:', err);
    return null;
  }
}

// Shared authed fetch helper.
async function apiGet<T>(accessToken: string, url: string): Promise<GbpResult<T>> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return fail(`GET ${res.status}: ${await res.text()}`);
    return ok(await res.json() as T);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'network error');
  }
}

async function apiSend<T>(
  accessToken: string, url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown,
): Promise<GbpResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return fail(`${method} ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return ok((text ? JSON.parse(text) : {}) as T);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'network error');
  }
}

// ── Accounts & locations ─────────────────────────────────────────────────────
export interface GbpAccount { name: string; accountName?: string; type?: string }
export function listAccounts(accessToken: string) {
  return apiGet<{ accounts?: GbpAccount[] }>(accessToken, `${ACCOUNT_MGMT}/accounts`);
}

export interface GbpLocation {
  name: string; title?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
  phoneNumbers?: { primaryPhone?: string };
  websiteUri?: string;
}
export function listLocations(accessToken: string, accountName: string) {
  const readMask = 'name,title,storefrontAddress,phoneNumbers,websiteUri';
  return apiGet<{ locations?: GbpLocation[] }>(
    accessToken, `${BUSINESS_INFO}/${accountName}/locations?readMask=${readMask}&pageSize=100`,
  );
}

// ── Reviews (My Business v4) ─────────────────────────────────────────────────
const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export function starRatingToInt(rating: string | null | undefined): number | null {
  if (!rating) return null;
  return STAR_MAP[rating] ?? null;
}

export interface GbpReview {
  reviewId: string; name: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: string; comment?: string;
  createTime?: string; updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}
export function listReviews(accessToken: string, accountId: string, locationId: string, pageToken?: string) {
  // locationId here is the bare location id; v4 needs accounts/{a}/locations/{l}.
  const base = `${MYBUSINESS_V4}/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50`;
  return apiGet<{ reviews?: GbpReview[]; nextPageToken?: string; averageRating?: number; totalReviewCount?: number }>(
    accessToken, pageToken ? `${base}&pageToken=${pageToken}` : base,
  );
}
export function replyToReview(accessToken: string, accountId: string, locationId: string, reviewId: string, comment: string) {
  return apiSend<{ comment?: string; updateTime?: string }>(
    accessToken,
    `${MYBUSINESS_V4}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`,
    'PUT', { comment },
  );
}

// ── Q&A ──────────────────────────────────────────────────────────────────────
export interface GbpQuestion {
  name: string; text?: string;
  author?: { displayName?: string };
  createTime?: string;
  topAnswers?: Array<{ text?: string }>;
}
export function listQuestions(accessToken: string, locationId: string) {
  return apiGet<{ questions?: GbpQuestion[] }>(
    accessToken, `${QANDA}/locations/${locationId}/questions?pageSize=50&answersPerQuestion=1`,
  );
}
export function answerQuestion(accessToken: string, questionName: string, text: string) {
  // questionName = 'locations/{l}/questions/{q}'
  return apiSend<{ text?: string }>(accessToken, `${QANDA}/${questionName}/answers:upsert`, 'POST', { answer: { text } });
}

// ── Local posts (My Business v4) ─────────────────────────────────────────────
export interface GbpLocalPost {
  languageCode?: string;
  summary?: string;
  topicType?: string; // STANDARD | OFFER | EVENT | ALERT
  callToAction?: { actionType?: string; url?: string };
  media?: Array<{ mediaFormat: 'PHOTO'; sourceUrl: string }>;
}
export function createLocalPost(accessToken: string, accountId: string, locationId: string, post: GbpLocalPost) {
  return apiSend<{ name?: string; state?: string }>(
    accessToken, `${MYBUSINESS_V4}/accounts/${accountId}/locations/${locationId}/localPosts`, 'POST', post,
  );
}
export function listLocalPosts(accessToken: string, accountId: string, locationId: string) {
  return apiGet<{ localPosts?: Array<{ name: string; summary?: string; state?: string; createTime?: string }> }>(
    accessToken, `${MYBUSINESS_V4}/accounts/${accountId}/locations/${locationId}/localPosts?pageSize=50`,
  );
}

// ── Performance / insights ───────────────────────────────────────────────────
// Daily metrics over a date range. `dailyMetrics` is repeated; caller passes the set.
export function getPerformanceMetrics(
  accessToken: string,
  locationId: string,
  metrics: string[],
  range: { startYear: number; startMonth: number; startDay: number; endYear: number; endMonth: number; endDay: number },
) {
  const params = new URLSearchParams();
  for (const m of metrics) params.append('dailyMetrics', m);
  params.set('dailyRange.start_date.year',  String(range.startYear));
  params.set('dailyRange.start_date.month', String(range.startMonth));
  params.set('dailyRange.start_date.day',   String(range.startDay));
  params.set('dailyRange.end_date.year',    String(range.endYear));
  params.set('dailyRange.end_date.month',   String(range.endMonth));
  params.set('dailyRange.end_date.day',     String(range.endDay));
  return apiGet<{
    multiDailyMetricTimeSeries?: Array<{
      dailyMetricTimeSeries?: Array<{
        dailyMetric?: string;
        timeSeries?: { datedValues?: Array<{ date?: { year: number; month: number; day: number }; value?: string }> };
      }>;
    }>;
  }>(accessToken, `${PERFORMANCE}/locations/${locationId}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`);
}

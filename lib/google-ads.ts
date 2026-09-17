// lib/google-ads.ts
// Google Ads API client — OAuth 2.0 per workspace, scope `adwords`. Reporting
// only (read-mostly), via GAQL search. Fail-soft: returns { ok, data | error }.
// Requires GOOGLE_ADS_DEVELOPER_TOKEN in the environment (from the MCC API Center).

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_API_VERSION = 'v17';
const ADS_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`;

export const ADWORDS_SCOPE = 'https://www.googleapis.com/auth/adwords';

export type AdsResult<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): AdsResult<T> => ({ ok: true, data });
const fail = <T>(error: string): AdsResult<T> => ({ ok: false, error });

interface TokenResponse { access_token: string; expires_in: number; refresh_token?: string; token_type: string }

function getClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/integrations/google-ads/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function getAdsOAuthUrl(workspaceId: string): string {
  const { clientId, redirectUri } = getClientCredentials();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: ADWORDS_SCOPE, access_type: 'offline', prompt: 'consent', state: workspaceId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getClientCredentials();
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const { clientId, clientSecret } = getClientCredentials();
    if (!clientId || !clientSecret) return null;
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
    });
    if (!res.ok) { console.error('[GoogleAds] refresh failed:', await res.text()); return null; }
    const data = await res.json() as TokenResponse;
    return data.access_token ?? null;
  } catch (err) {
    console.error('[GoogleAds] refreshAccessToken error:', err);
    return null;
  }
}

// List the customer accounts the authorized user can access (resourceNames like
// "customers/1234567890"). Developer tokens were sunset (2026-09-09) — access is
// now project-based via the OAuth credentials' GCP project; the token header is
// optional and only sent if still configured (backward-compat).
export async function listAccessibleCustomers(accessToken: string): Promise<AdsResult<string[]>> {
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
    if (devToken) headers['developer-token'] = devToken;
    const res = await fetch(`${ADS_BASE}/customers:listAccessibleCustomers`, { headers });
    if (!res.ok) return fail(`listAccessibleCustomers ${res.status}: ${await res.text()}`);
    const data = await res.json() as { resourceNames?: string[] };
    const ids = (data.resourceNames ?? []).map((r) => r.split('/').pop() ?? '').filter(Boolean);
    return ok(ids);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'network error');
  }
}

export interface GaqlRow { [key: string]: any }

// Run a GAQL query against a customer account. `loginCustomerId` (MCC) is
// optional and only needed for manager-level access.
export async function searchGaql(
  accessToken: string, customerId: string, query: string, loginCustomerId?: string | null,
): Promise<AdsResult<GaqlRow[]>> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    // Developer tokens were sunset (2026-09-09); access is now project-based via
    // the OAuth credentials' GCP project. Sent only if still configured.
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
    if (devToken) headers['developer-token'] = devToken;
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');
    const res = await fetch(`${ADS_BASE}/customers/${customerId.replace(/-/g, '')}/googleAds:search`, {
      method: 'POST', headers, body: JSON.stringify({ query }),
    });
    if (!res.ok) return fail(`search ${res.status}: ${await res.text()}`);
    const data = await res.json() as { results?: GaqlRow[] };
    return ok(data.results ?? []);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'network error');
  }
}

export function microsToCurrency(micros: number | string | null | undefined): number {
  const n = Number(micros ?? 0);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

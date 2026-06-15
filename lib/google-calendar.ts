// Google Calendar API helper — OAuth 2.0 per workspace

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string; // ISO 8601
  endDateTime: string;
  attendeeEmail?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

function getClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/integrations/google-calendar/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function getGoogleOAuthUrl(workspaceId: string): string {
  const { clientId, redirectUri } = getClientCredentials();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
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
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json() as Promise<TokenResponse>;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getClientCredentials();
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Failed to refresh Google access token');
  const data = await res.json() as TokenResponse;
  return data.access_token;
}

export async function createCalendarEvent(
  refreshToken: string,
  calendarId: string,
  event: CalendarEvent,
): Promise<string | null> {
  try {
    const accessToken = await refreshAccessToken(refreshToken);

    const body: Record<string, unknown> = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startDateTime, timeZone: 'Asia/Kolkata' },
      end:   { dateTime: event.endDateTime,   timeZone: 'Asia/Kolkata' },
    };

    if (event.attendeeEmail) {
      body.attendees = [{ email: event.attendeeEmail }];
    }

    const res = await fetch(
      `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      console.error('[GCal] Event creation failed:', await res.text());
      return null;
    }
    const data = await res.json() as { id: string };
    return data.id ?? null;
  } catch (err) {
    console.error('[GCal] createCalendarEvent error:', err);
    return null;
  }
}

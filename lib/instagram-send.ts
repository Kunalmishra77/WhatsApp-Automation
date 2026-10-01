// lib/instagram-send.ts
// Outbound Instagram messaging via the Graph API (IG Messaging). Used by the
// webhook auto-reply and the follow-first automation. Fail-soft: returns a
// boolean / null rather than throwing so a send failure never breaks the webhook.

const GRAPH = 'https://graph.facebook.com/v19.0';

// Send a text DM reply to an Instagram user (by their IGSID).
export async function sendInstagramText(
  igUserId: string,
  accessToken: string,
  recipientIgsid: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const token = accessToken.replace(/﻿/g, '').trim();
    const res = await fetch(`${GRAPH}/${igUserId}/messages?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientIgsid }, message: { text } }),
    });
    const data = await res.json().catch(() => ({})) as { message_id?: string; error?: { message?: string } };
    if (!res.ok) {
      console.error('[IG send] failed:', res.status, data?.error?.message);
      return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data.message_id };
  } catch (err) {
    console.error('[IG send] error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

// Follow an Instagram user back (best-effort "follow-first"). Requires the
// appropriate permissions on the token; silently no-ops on failure.
export async function followInstagramUser(
  igUserId: string,
  accessToken: string,
  targetIgsid: string,
): Promise<boolean> {
  try {
    const token = accessToken.replace(/﻿/g, '').trim();
    const res = await fetch(`${GRAPH}/${igUserId}/following?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: targetIgsid }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

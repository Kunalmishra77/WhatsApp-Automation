// lib/lead-attribution.ts
// Phase 1 (Unified Lead Hub) — PURE, DB-free attribution helpers.
// The DB writer lives in lib/lead-touchpoint.ts (mirrors the
// campaign-reply-attribution.ts / campaign-reply-sync.ts split): pure logic
// here is unit-tested; all I/O is isolated in the thin writer.

export type Channel =
  | 'whatsapp'
  | 'instagram'
  | 'meta_ads'
  | 'google_ads'
  | 'gbp'
  | 'website'
  | 'chat_widget'
  | 'campaign'
  | 'api'
  | 'referral'
  | 'manual'
  | 'other';

export const CHANNELS: readonly Channel[] = [
  'whatsapp',
  'instagram',
  'meta_ads',
  'google_ads',
  'gbp',
  'website',
  'chat_widget',
  'campaign',
  'api',
  'referral',
  'manual',
  'other',
] as const;

export function isChannel(x: unknown): x is Channel {
  return typeof x === 'string' && (CHANNELS as readonly string[]).includes(x);
}

// Free-text `source` / label values seen across the codebase → normalized channel.
const CHANNEL_ALIASES: Record<string, Channel> = {
  // WhatsApp
  whatsapp: 'whatsapp',
  whatsapp_flow: 'whatsapp',
  wa: 'whatsapp',
  wa_flow: 'whatsapp',
  ctwa: 'meta_ads', // click-to-WhatsApp originates from a Meta ad
  // Instagram
  instagram: 'instagram',
  instagram_dm: 'instagram',
  ig: 'instagram',
  // Meta / Facebook ads
  meta_ad: 'meta_ads',
  meta_ads: 'meta_ads',
  meta: 'meta_ads',
  facebook_ad: 'meta_ads',
  fb_ad: 'meta_ads',
  facebook_ads: 'meta_ads',
  // Google ads
  google_ad: 'google_ads',
  google_ads: 'google_ads',
  adwords: 'google_ads',
  gads: 'google_ads',
  // Google Business Profile
  gbp: 'gbp',
  gmb: 'gbp',
  google_business: 'gbp',
  google_business_profile: 'gbp',
  // Website / widget
  website: 'website',
  web: 'website',
  site: 'website',
  chat_widget: 'chat_widget',
  widget: 'chat_widget',
  // Campaign / broadcast
  campaign: 'campaign',
  broadcast: 'campaign',
  // API
  api: 'api',
  rest_api: 'api',
  v1: 'api',
  // Referral
  referral: 'referral',
  ref: 'referral',
  // Manual / imports
  manual: 'manual',
  import: 'manual',
  csv: 'manual',
  csv_import: 'manual',
  bulk: 'manual',
  bulk_import: 'manual',
  admin: 'manual',
  dashboard: 'manual',
  // Facebook Messenger has no first-class channel in the vocab
  messenger: 'other',
  facebook: 'other',
  fb: 'other',
};

/**
 * Normalize an arbitrary free-text source/label into a canonical Channel.
 * Returns `fallback` (default 'other') when the value is empty or unknown.
 */
export function normalizeChannel(raw: unknown, fallback: Channel = 'other'): Channel {
  if (raw == null) return fallback;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return fallback;
  if (CHANNEL_ALIASES[key]) return CHANNEL_ALIASES[key];
  if (isChannel(key)) return key;
  return fallback;
}

export interface TouchTimes {
  firstChannel: Channel | null;
  firstAt: string | null; // ISO
  lastChannel: Channel | null;
  lastAt: string | null; // ISO
}

export interface IncomingTouch {
  channel: Channel;
  at: string; // ISO
}

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * Fold a new touch into a contact/lead's first/last-touch state.
 * - first_touch is set if empty, or replaced only when the incoming touch is
 *   strictly EARLIER than the recorded first touch (backfilling older history).
 * - last_touch is set if empty, or replaced when the incoming touch is at or
 *   after the recorded last touch.
 * Returns a NEW object; never mutates `existing`.
 */
export function mergeTouch(existing: TouchTimes, incoming: IncomingTouch): TouchTimes {
  const next: TouchTimes = { ...existing };
  const inMs = ms(incoming.at);
  if (inMs == null) return next; // ignore un-parseable timestamps

  const firstMs = ms(existing.firstAt);
  if (firstMs == null || inMs < firstMs) {
    next.firstChannel = incoming.channel;
    next.firstAt = incoming.at;
  }

  const lastMs = ms(existing.lastAt);
  if (lastMs == null || inMs >= lastMs) {
    next.lastChannel = incoming.channel;
    next.lastAt = incoming.at;
  }

  return next;
}

// lib/roi-sources.ts
//
// Whether an ad channel's spend figure is a measurement or an absence.
//
// The Marketing ROI page showed "Ad spend ₹0" under a heading promising
// "spend, revenue, ROAS and true ROI across every channel". A client reading
// that cannot tell whether they spent nothing on ads or never connected an ad
// account — and today none of the fifteen workspaces has `settings.meta_ads`
// or `settings.google_ads` at all, so every one of them was being shown ₹0 as
// though it had been counted.
//
// ₹0 is a claim. "Not connected" is the truth, and it is also the one the
// client can act on.
//
// Pure, so the rule about when a zero may be shown is tested rather than
// buried in a route.

export type RoiSourceKey = 'meta_ads' | 'google_ads';

export interface RoiSource {
  key: RoiSourceKey;
  label: string;
  /** The workspace has credentials for this channel. */
  connected: boolean;
  /** Spend rows exist for this channel in the window asked about. */
  hasSpend: boolean;
  /** What to show in place of a number, or null when the number is real. */
  note: string | null;
}

const LABELS: Record<RoiSourceKey, string> = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
};

/**
 * One source's state.
 *
 * The three cases are deliberately distinct, because collapsing any two of
 * them is how a page starts lying:
 *
 *  * not connected        — nothing has ever been measured. Say so.
 *  * connected, no rows   — measured, and the answer is nothing in this
 *                           window. ₹0 is true here.
 *  * connected, has rows  — a number.
 */
export function describeSource(
  key: RoiSourceKey,
  connected: boolean,
  hasSpend: boolean,
): RoiSource {
  return {
    key,
    label: LABELS[key],
    connected,
    hasSpend,
    note: connected ? null : `${LABELS[key]} is not connected, so its spend is not counted here.`,
  };
}

/**
 * Whether a total ad-spend figure means anything yet.
 *
 * False when no ad source is connected at all — the page then shows a dash
 * rather than a zero, because the platform has not measured ₹0, it has
 * measured nothing. With even one source connected the total is a real sum,
 * and the per-source notes say what it does and does not include.
 */
export function adSpendIsMeasured(sources: readonly RoiSource[]): boolean {
  return sources.some((s) => s.connected);
}

/**
 * The line under the KPIs. Null when every ad source is connected and there is
 * nothing to explain — an explanation nobody needs is noise, and noise is how
 * the explanations that matter get skipped.
 */
export function summariseSources(sources: readonly RoiSource[]): string | null {
  const missing = sources.filter((s) => !s.connected);
  if (missing.length === 0) return null;

  const names = missing.map((s) => s.label);
  const list = names.length === 1
    ? names[0]!
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  if (missing.length === sources.length) {
    return `No ad account is connected, so there is no ad spend to compare revenue against. Connect ${list} in Settings → Integrations to see ROAS and true ROI.`;
  }
  return `${list} ${names.length === 1 ? 'is' : 'are'} not connected, so ${names.length === 1 ? 'its' : 'their'} spend is missing from these figures.`;
}

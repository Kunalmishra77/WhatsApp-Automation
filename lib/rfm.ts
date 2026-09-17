// lib/rfm.ts
// Pure RFM (Recency / Frequency / Monetary) segmentation. The API computes each
// contact's r/f/m scores (1-3) from orders; this maps the scores to a named,
// actionable segment. Kept pure for unit testing.

export type RfmSegment =
  | 'champions' | 'loyal' | 'big_spenders' | 'new' | 'promising'
  | 'at_risk' | 'lost' | 'needs_attention';

export const SEGMENT_LABELS: Record<RfmSegment, string> = {
  champions: 'Champions',
  loyal: 'Loyal',
  big_spenders: 'Big Spenders',
  new: 'New',
  promising: 'Promising',
  at_risk: 'At Risk',
  lost: 'Lost',
  needs_attention: 'Needs Attention',
};

export const SEGMENT_TIP: Record<RfmSegment, string> = {
  champions: 'Reward them — ask for referrals & reviews.',
  loyal: 'Upsell and keep them engaged with offers.',
  big_spenders: 'Offer premium products and VIP treatment.',
  new: 'Onboard warmly and encourage a second purchase.',
  promising: 'Nurture with a targeted offer to convert to loyal.',
  at_risk: 'Win them back with a personalised WhatsApp offer.',
  lost: 'Re-activation campaign — a strong comeback deal.',
  needs_attention: 'Re-engage before they go cold.',
};

// r, f, m each in 1..3 (3 = best/most recent/highest).
export function segmentFromScores(r: number, f: number, m: number): RfmSegment {
  if (r >= 3 && f >= 2 && m >= 2) return 'champions';
  if (f >= 3) return 'loyal';
  if (m >= 3 && r >= 2) return 'big_spenders';
  if (r >= 3 && f <= 1) return 'new';
  if (r <= 1 && f >= 2) return 'at_risk';
  if (r <= 1 && f <= 1) return 'lost';
  if (r >= 2) return 'promising';
  return 'needs_attention';
}

export function recencyScore(days: number): number {
  if (days <= 30) return 3;
  if (days <= 90) return 2;
  return 1;
}

export function frequencyScore(count: number): number {
  if (count >= 5) return 3;
  if (count >= 2) return 2;
  return 1;
}

// Monetary score relative to the dataset's tertile thresholds (t1 < t2).
export function monetaryScore(amount: number, t1: number, t2: number): number {
  if (amount >= t2) return 3;
  if (amount >= t1) return 2;
  return 1;
}

// lib/offer.ts — Current Offer: the single authoritative pricing the bot quotes.

export interface ActiveOffer {
  name: string;
  details: string;
  valid_from?: string;   // 'YYYY-MM-DD'
  valid_until?: string;  // 'YYYY-MM-DD'
  updated_at?: string;
  lapse_notified?: boolean;
}

export type OfferStatus = 'active' | 'expired' | 'scheduled' | 'none';

// ₹/Rs/INR followed by grouped digits. Word-boundary on rs/inr avoids matching inside words.
const MONEY_RE = /(?:₹|\brs\.?|\binr\b)\s*(\d[\d,\s]{2,})/gi;

// Validates a real calendar date in 'YYYY-MM-DD' form (rejects format-valid but
// calendar-invalid values like '2026-13-40' or '2026-02-30' via round-trip).
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseActiveOffer(settings: Record<string, unknown> | null | undefined): ActiveOffer | null {
  const raw = settings?.active_offer;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.details !== 'string') return null;
  if (!o.name.trim() || !o.details.trim()) return null;
  return {
    name: o.name,
    details: o.details,
    valid_from: typeof o.valid_from === 'string' && isValidDate(o.valid_from) ? o.valid_from : undefined,
    valid_until: typeof o.valid_until === 'string' && isValidDate(o.valid_until) ? o.valid_until : undefined,
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : undefined,
    lapse_notified: o.lapse_notified === true,
  };
}

// todayISO = 'YYYY-MM-DD'. Date strings compare correctly lexicographically.
export function computeOfferStatus(offer: ActiveOffer | null, todayISO: string): OfferStatus {
  if (!offer) return 'none';
  if (offer.valid_from && offer.valid_from > todayISO) return 'scheduled';
  if (offer.valid_until && offer.valid_until < todayISO) return 'expired';
  return 'active';
}

export function buildOfferBlock(offer: ActiveOffer | null, status: OfferStatus): string {
  if (status === 'active' && offer) {
    const validity = offer.valid_until ? ` Valid until ${offer.valid_until}.` : '';
    return `🔴 CURRENT OFFER — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW.
This is the ONLY price/offer you may quote. If the customer asks about price, plans, or offers, use EXACTLY this and nothing else. NEVER quote any other price, plan, discount, or EMI that appears anywhere else in this prompt or the knowledge base — those are outdated.
Offer: ${offer.name}
${offer.details}${validity}

`;
  }
  if (status === 'expired' || status === 'scheduled') {
    return `PRICING RULE: There is no active offer right now. If the customer asks about price, plans, or offers, do NOT quote any number from the knowledge base or persona. Warmly say a team member will share the latest pricing shortly, and capture their interest / ask for the best number to reach them.

`;
  }
  return '';
}

export function pricingBlockForSettings(
  settings: Record<string, unknown> | null | undefined, todayISO: string,
): string {
  const offer = parseActiveOffer(settings);
  return buildOfferBlock(offer, computeOfferStatus(offer, todayISO));
}

export function extractMoneyAmounts(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;
  for (const m of text.matchAll(MONEY_RE)) {
    const norm = m[1]!.replace(/[,\s]/g, '');
    if (norm.length >= 3) out.push(norm);
  }
  return out;
}

export function findConflictingAmounts(offerDetails: string, sources: string[]): string[] {
  const offerSet = new Set(extractMoneyAmounts(offerDetails));
  const seen = new Map<string, string>(); // normalized -> display
  for (const src of sources) {
    if (!src) continue;
    for (const m of src.matchAll(MONEY_RE)) {
      const norm = m[1]!.replace(/[,\s]/g, '');
      if (norm.length < 3 || offerSet.has(norm) || seen.has(norm)) continue;
      seen.set(norm, `₹${Number(norm).toLocaleString('en-IN')}`);
    }
  }
  return [...seen.values()];
}

export interface OfferInput {
  name?: unknown; details?: unknown; valid_from?: unknown; valid_until?: unknown;
}

export function validateOfferInput(
  body: OfferInput,
): { ok: true; offer: ActiveOffer } | { ok: false; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (!name) return { ok: false, error: 'name is required' };
  if (!details) return { ok: false, error: 'details is required' };
  if (details.length > 1500) return { ok: false, error: 'details must be 1500 characters or fewer' };
  const vf = typeof body.valid_from === 'string' && body.valid_from ? body.valid_from : undefined;
  const vu = typeof body.valid_until === 'string' && body.valid_until ? body.valid_until : undefined;
  if (vf && !isValidDate(vf)) return { ok: false, error: 'valid_from must be YYYY-MM-DD' };
  if (vu && !isValidDate(vu)) return { ok: false, error: 'valid_until must be YYYY-MM-DD' };
  if (vf && vu && vu < vf) return { ok: false, error: 'valid_until must be on or after valid_from' };
  return { ok: true, offer: { name, details, valid_from: vf, valid_until: vu } };
}

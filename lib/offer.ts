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
  // An offer that is over, or not started, used to gag the bot: it was told to
  // quote no number at all and to promise that someone would follow up. VMS's
  // event offer ended on 9 September, so for seven weeks every price question
  // got "a team member will share pricing shortly" — the business's own plans
  // were sitting in the knowledge base the whole time.
  //
  // The offer stops being quotable. The business does not stop having prices.
  if (status === 'expired' || status === 'scheduled') {
    const which = offer ? `"${offer.name}"` : 'The special offer';
    const state = status === 'expired' ? 'has ended' : 'has not started yet';
    return `PRICING RULE — ${which} ${state} and must NOT be quoted or advertised.
Do not bring it up. If the customer asks about it specifically, say in one line that it ${state}, then help them with what is currently available.
For every price, plan or offer question, answer normally from this business's own prices and plans in the knowledge base and persona below. Never invent a discount.

`;
  }
  return '';
}

/**
 * The offer block plus the status behind it.
 *
 * The caller needs the status, not just the text: the "this block is the ONLY
 * authority on pricing" rule belongs with an ACTIVE offer and contradicts an
 * expired one, which now sends the bot to the knowledge base instead.
 */
export function offerContextForSettings(
  settings: Record<string, unknown> | null | undefined, todayISO: string,
): { block: string; status: OfferStatus } {
  const offer = parseActiveOffer(settings);
  const status = computeOfferStatus(offer, todayISO);
  return { block: buildOfferBlock(offer, status), status };
}

export function pricingBlockForSettings(
  settings: Record<string, unknown> | null | undefined, todayISO: string,
): string {
  return offerContextForSettings(settings, todayISO).block;
}

// ── Is this workspace ready to run a campaign? ────────────────────────────────
// Asked on the campaign wizard's review step, because the offer is the thing
// nobody remembers. Fitness First sent a Diwali campaign — flat 30% off, 12+3
// months, ₹3,333/month — with no offer set, and the bot answered price questions
// from the knowledge base: ₹7,500/month in one reply, ₹8,000 activation plus
// ₹5,500/month in another, to a lead who asked twice. Of twelve workspaces, two
// had ever set an offer and both were stale.
//
// Every case below is one that has actually happened on this platform.
export interface OfferReadiness {
  level: 'ok' | 'warn';
  headline: string;
  detail: string;
}

export function offerReadinessForCampaign(
  settings: Record<string, unknown> | null | undefined,
  todayISO: string,
): OfferReadiness {
  const offer = parseActiveOffer(settings);
  const status = computeOfferStatus(offer, todayISO);

  if (!offer || status === 'none') {
    return {
      level: 'warn',
      headline: 'No offer is set for the bot',
      detail:
        'Customers who reply to this campaign and ask about price will get whatever is in the knowledge base, which may not be what the campaign advertises. Set the Current Offer on the Knowledge Base page first.',
    };
  }

  if (status === 'expired') {
    return {
      level: 'warn',
      headline: `"${offer.name}" has already ended`,
      detail:
        `It ended on ${offer.valid_until}, so the bot will not quote it and will answer from this business's regular prices instead. If this campaign is advertising it, extend the end date or replace the offer.`,
    };
  }

  if (status === 'scheduled') {
    return {
      level: 'warn',
      headline: `"${offer.name}" has not started yet`,
      detail:
        `It begins on ${offer.valid_from}. Anyone who replies before then will not be quoted it. Either start the offer today or schedule this campaign for the same date.`,
    };
  }

  // Running, but with no end date it never stops — Thames's "Monsoon Offer" was
  // still the only price its bot would quote in late October.
  if (!offer.valid_until) {
    return {
      level: 'warn',
      headline: `"${offer.name}" has no end date`,
      detail:
        'The bot will keep quoting it long after this campaign is over, and will refuse to quote anything else. Add an end date so it retires itself.',
    };
  }

  return {
    level: 'ok',
    headline: `The bot will quote "${offer.name}"`,
    detail: `Valid until ${offer.valid_until}. After that it stops on its own and price questions go back to this business's regular plans.`,
  };
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
  if (name.length > 120) return { ok: false, error: 'name must be 120 characters or fewer' };
  if (!details) return { ok: false, error: 'details is required' };
  if (details.length > 1500) return { ok: false, error: 'details must be 1500 characters or fewer' };
  const vf = typeof body.valid_from === 'string' && body.valid_from ? body.valid_from : undefined;
  const vu = typeof body.valid_until === 'string' && body.valid_until ? body.valid_until : undefined;
  // An end date is required. Without one the offer never retires, and while it
  // is live it is the only price the bot may quote — Thames ran a "Monsoon
  // Offer" with no end date into late October, and its bot was still quoting
  // monsoon discounts as the sole pricing authority. Nothing in the business
  // tells the bot an offer is over; only this date does.
  if (!vu) return { ok: false, error: 'valid_until is required — an offer with no end date never stops being quoted' };
  if (vf && !isValidDate(vf)) return { ok: false, error: 'valid_from must be YYYY-MM-DD' };
  if (!isValidDate(vu)) return { ok: false, error: 'valid_until must be YYYY-MM-DD' };
  if (vf && vu && vu < vf) return { ok: false, error: 'valid_until must be on or after valid_from' };
  return { ok: true, offer: { name, details, valid_from: vf, valid_until: vu } };
}

// ── Where does this workspace's offer stand, today? ──────────────────────────
// The campaign wizard asks the same question at send time (offerReadinessForCampaign
// above). This answers it for the dashboard, where nobody is about to send
// anything — so the wording is about what the bot is doing right now, and the
// one state the wizard cannot see is added: an offer that is about to lapse.
//
// Everything a client has ever been bitten by is a case below. What is
// deliberately NOT a warning: having no offer at all. Ten of twelve workspaces
// have none, the bot answers price questions from their knowledge base, and
// that is a correct way to run. A red banner on ten dashboards for a
// non-problem teaches people to ignore the banner on the eleventh.

/** Days before the end date that the dashboard starts calling it out. */
export const OFFER_ENDING_SOON_DAYS = 7;

/**
 * Days before the end date that the client is notified once.
 *
 * Tighter than the banner's window on purpose: the banner is passive — it waits
 * for someone to log in, so it needs a wide window to be seen at all. The
 * notification is active and fires once, so it should land close enough to the
 * date to still be the thing on someone's mind. Migration 134 uses this number.
 */
export const OFFER_LAPSE_WARNING_DAYS = 3;

/** Whole days from one 'YYYY-MM-DD' to another. Negative when `to` is earlier. */
export function daysBetweenISO(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * '2026-11-09' → '9 Nov', or '9 Nov 2025' when it is not the current year.
 *
 * Built from a fixed month list rather than Intl, so the same input reads the
 * same on the server, in the browser and in tests — the server runs in UTC and
 * the client does not, and a date-only string has no business being re-zoned.
 */
export function formatOfferDate(iso: string, todayISO?: string): string {
  if (!isValidDate(iso)) return iso;
  const [y, m, d] = iso.split('-');
  const month = MONTHS[Number(m) - 1] ?? m;
  const sameYear = todayISO ? todayISO.slice(0, 4) === y : false;
  return sameYear ? `${Number(d)} ${month}` : `${Number(d)} ${month} ${y}`;
}

export type OfferAlertTone = 'neutral' | 'good' | 'info' | 'warn' | 'bad';

export interface OfferAlert {
  tone: OfferAlertTone;
  status: OfferStatus;
  /** Days until the end date; 0 on the last day, negative once it has passed. Null with no end date. */
  daysLeft: number | null;
  headline: string;
  detail: string;
  /** What the client would have to do about it. */
  action: 'set' | 'add_end_date' | 'extend_or_replace' | 'none';
}

export function offerAlert(offer: ActiveOffer | null, todayISO: string): OfferAlert {
  const status = computeOfferStatus(offer, todayISO);

  if (!offer || status === 'none') {
    return {
      tone: 'neutral', status: 'none', daysLeft: null, action: 'set',
      headline: 'No offer is set',
      detail:
        'Price questions are answered from your knowledge base and your bot persona. Set a Current Offer when you are running one, and the bot will quote that instead.',
    };
  }

  const quoted = `"${offer.name}"`;

  if (status === 'scheduled') {
    return {
      tone: 'info', status, action: 'none',
      daysLeft: offer.valid_until ? daysBetweenISO(todayISO, offer.valid_until) : null,
      headline: `${quoted} starts ${formatOfferDate(offer.valid_from!, todayISO)}`,
      detail:
        'Until that date the bot will not quote it — anyone who asks about price before then gets your regular plans.',
    };
  }

  if (status === 'expired') {
    const ago = -daysBetweenISO(todayISO, offer.valid_until!);
    return {
      tone: 'bad', status, daysLeft: -ago, action: 'extend_or_replace',
      headline: `${quoted} ended ${ago === 1 ? 'yesterday' : `${ago} days ago`}`,
      detail:
        'The bot has stopped quoting it and answers price questions from your knowledge base instead. Extend the end date or set a new offer.',
    };
  }

  // Running, but with no end date it never retires — Thames's "Monsoon Offer"
  // was still its bot's only quotable price in late October.
  if (!offer.valid_until) {
    return {
      tone: 'warn', status, daysLeft: null, action: 'add_end_date',
      headline: `${quoted} has no end date`,
      detail:
        'It will stay the only price the bot quotes until somebody removes it by hand. Add an end date so it retires on its own.',
    };
  }

  const daysLeft = daysBetweenISO(todayISO, offer.valid_until);
  const ends = formatOfferDate(offer.valid_until, todayISO);

  if (daysLeft <= OFFER_ENDING_SOON_DAYS) {
    const when = daysLeft === 0 ? 'ends today' : daysLeft === 1 ? 'ends tomorrow' : `ends in ${daysLeft} days`;
    return {
      tone: 'warn', status, daysLeft, action: 'extend_or_replace',
      headline: `${quoted} ${when}`,
      detail:
        `After ${ends} the bot stops quoting it and price questions go back to your regular plans. Extend it or set the next offer before then.`,
    };
  }

  return {
    tone: 'good', status, daysLeft, action: 'none',
    headline: `The bot is quoting ${quoted}`,
    detail: `Valid until ${ends} — ${daysLeft} days left. After that it retires itself and price questions go back to your regular plans.`,
  };
}

export function offerAlertForSettings(
  settings: Record<string, unknown> | null | undefined, todayISO: string,
): OfferAlert {
  return offerAlert(parseActiveOffer(settings), todayISO);
}

/** 'YYYY-MM-DD' for today in IST, which is the day every client reads a date as. */
export function todayInIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

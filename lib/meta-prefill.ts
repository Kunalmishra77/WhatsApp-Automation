/**
 * Meta click-to-WhatsApp ad pre-fill texts.
 *
 * Attribution used to rest entirely on Meta sending a `referral` object with the
 * inbound message. It doesn't always: in production the SAME Razorveda ad text was
 * attributed 129 times and missed 75 times. The documented fallback — recognising
 * the ad's pre-filled opening message — existed but was unusable, because it
 * required exact string equality against texts a human had to type in by hand, and
 * 11 of 13 workspaces had none registered.
 *
 * This module makes that fallback work on its own: it normalises the comparison so
 * real-world variants still match, and it decides which texts are safe to LEARN
 * from a confirmed referral so the next click on the same ad is attributed even
 * when Meta stays silent.
 */

/**
 * Comparison form of a pre-fill message.
 *
 * Real messages for one ad arrived as:
 *   "Hi, I need more info about Mamo Plus"
 *   "🍬🩷Hi, I need more info about Mamo Plus"     ← emoji prefix
 *   "Hi, I’m interested in …"                      ← curly apostrophe
 * Exact equality matched the first and missed the rest.
 */
export function normalisePrefill(text: string): string {
  return text
    .normalize('NFKC')
    // Curly quotes and dashes to their ASCII forms.
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    // Strip anything that isn't a letter, number or quote from the ends — emoji,
    // zero-width joiners, variation selectors, stray punctuation.
    .replace(/^[^\p{L}\p{N}'"]+/u, '')
    .replace(/[^\p{L}\p{N}'"?!.]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Openings that must never be treated as an ad pre-fill, however often Meta
 * attributes them. These are what a person types themselves, so learning one
 * would wrongly tag every organic chat that starts the same way.
 */
const GENERIC_OPENINGS = new Set([
  'hi', 'hii', 'hiii', 'hey', 'hello', 'helo', 'hlo', 'yes', 'no', 'ok', 'okay',
  'price', 'rate', 'cost', 'details', 'info', 'order', 'test',
  'हाय', 'नमस्ते', 'हैलो', 'हेलो', 'कीमत', 'दाम',
]);

/**
 * A message has to be at least this long to be compared against pre-fills at all.
 * Hand-registered texts can be shorter than the learning bar below, so this stays
 * low — but a two-word message is never worth matching.
 */
const MIN_MATCH_LEN = 12;

/**
 * The bar for LEARNING is deliberately much higher than the bar for matching.
 *
 * Meta attributes the first message after an ad click whatever it says, so people
 * who clear the composer and type their own opening get attributed too. Production
 * learned exactly that: "Kaha par hai", "Location send me", "address kya hai ji".
 * Those are questions a hospital's organic visitors ask constantly — trusting one
 * would tag every organic chat as an ad lead.
 *
 * A genuine pre-fill is a full sentence Meta writes ("Hi, I'm interested in Mamo
 * Firm. Could you please tell me more about this product?"), so requiring a real
 * sentence separates the two cleanly: every true pre-fill in production clears 25
 * characters, and every typed-by-hand opening falls short of it.
 */
const MIN_LEARN_LEN   = 25;
const MIN_LEARN_WORDS = 4;

/**
 * Is this text distinctive enough to be remembered as an ad pre-fill?
 *
 * A pre-fill is a sentence Meta writes into the composer ("Hi, I'm interested in
 * Mamo Firm…"). A greeting, a single word, or one of our own system placeholders
 * is not, and learning one would attribute organic traffic to ads.
 */
export function isLearnablePrefill(text: string | null | undefined): boolean {
  if (!text) return false;
  const n = normalisePrefill(text);
  if (n.length < MIN_LEARN_LEN) return false;
  if (n.split(' ').length < MIN_LEARN_WORDS) return false;
  if (GENERIC_OPENINGS.has(n)) return false;
  // Our own placeholders and WhatsApp interactive echoes, not the customer's words.
  // Tested against the raw text as well as the normalised one, because normalising
  // strips the very brackets that mark a placeholder: '[Tapped button: "X"]'
  // normalises to 'tapped button: "x"'.
  const raw = text.trim().toLowerCase();
  if (raw.startsWith('[') && raw.endsWith(']')) return false;
  if (n.startsWith('tapped button')) return false;
  if (n.includes("whatsapp couldn't read")) return false;
  if (/^https?:\/\//.test(raw)) return false;
  return true;
}

export interface PrefillRow {
  text: string;
  template_name: string | null;
}

/**
 * Find the registered pre-fill this message opens with, or null.
 *
 * Matching is normalised, and also accepts the case where one side is a prefix of
 * the other: Meta truncates long pre-fills at the composer, so the same ad can
 * arrive as the full sentence or cut short ("…tell me more about this produc").
 * The prefix path demands a substantial overlap so short texts can't collide.
 */
export function matchPrefill(
  content: string | null | undefined,
  prefills: readonly PrefillRow[],
): PrefillRow | null {
  if (!content) return null;
  const msg = normalisePrefill(content);
  if (msg.length < MIN_MATCH_LEN) return null;

  for (const p of prefills) {
    const known = normalisePrefill(p.text);
    if (!known) continue;
    if (known === msg) return p;

    const shorter = known.length < msg.length ? known : msg;
    const longer  = known.length < msg.length ? msg : known;
    // A truncated variant still has to carry most of the known text.
    if (shorter.length >= 25 && longer.startsWith(shorter)) return p;
  }
  return null;
}

/**
 * May this row be used to attribute traffic?
 *
 * A human who registers a text has vouched for it, so it is trusted immediately.
 * A learned one has to have been seen twice AND be a full sentence — the same bar
 * isLearnablePrefill() applies. Keeping the length check here too means rows
 * learned under an earlier, looser rule can never start attributing traffic, however
 * many times they are seen again.
 */
export function isTrustedPrefill(
  row: PrefillRow & { auto_learned?: boolean | null; seen_count?: number | null },
): boolean {
  if (!row.auto_learned) return true;
  if ((row.seen_count ?? 0) < 2) return false;
  return normalisePrefill(row.text).length >= MIN_LEARN_LEN;
}

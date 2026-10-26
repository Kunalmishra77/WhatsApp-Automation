// lib/business-greeting.ts
//
// Recognises the automated greeting another company's WhatsApp Business account
// sends when we message it. These arrive as ordinary inbound messages and became
// leads: across the platform ~975 conversations are nothing but another firm's
// auto-responder, and for the clients doing B2B outreach they are over half the
// lead list — Lennore 52%, VMS 45%, V4you 52%, Santure 44%. Their scores sit near
// the floor (Lennore averages 12/100) because there is no person behind them,
// which drags every average the client looks at.
//
// They are flagged, never hidden or deleted. A real person often answers after
// the greeting, and that conversation is a genuine B2B lead — which is also why
// the bot still replies to these. The flag exists so a client can tell the two
// apart, not so the platform can decide for them.

// Phrases a business opens with and a customer answering a campaign does not.
// Deliberately specific: "welcome" or "hello" alone would catch real people.
const GREETING_PATTERNS: RegExp[] = [
  /\bwelcome to\b/i,
  /\bthank you for (contacting|reaching out to|connecting with|your (message|enquiry|inquiry|interest))\b/i,
  /\bthanks for (contacting|reaching out to|connecting with)\b/i,
  /\bgreetings from\b/i,
  /\bwe('| a)re (currently )?(unavailable|not available|away|closed)\b/i,
  /\bwe will (revert|get back to you|respond)\b/i,
  /\bwe'll (revert|get back to you|respond)\b/i,
  /\bour (team|representative) will (contact|reach|get back)\b/i,
  /\bthis is an automated (message|reply|response)\b/i,
  // Hindi equivalents seen in production.
  /से जुड़ने के लिए आपका धन्यवाद/,
  /संपर्क करने के लिए धन्यवाद/,
  /में आपका स्वागत है/,
];

// A greeting carries a business's name and pitch, so it runs long. A bare
// "welcome" from a person is short, and this keeps that from matching.
const MIN_LENGTH = 40;

/**
 * True when an inbound message looks like another business's automated greeting.
 *
 * Judges the text only. The caller decides whether position matters — it is the
 * FIRST inbound of a conversation that identifies an auto-responder, since the
 * same words later in a thread are just someone being polite.
 */
export function isBusinessGreeting(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < MIN_LENGTH) return false;
  return GREETING_PATTERNS.some((re) => re.test(t));
}

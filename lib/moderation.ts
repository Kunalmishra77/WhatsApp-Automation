/**
 * Content moderation for inbound customer media.
 *
 * Built for a real incident: one contact sent a Razorveda workspace 111 images,
 * mostly explicit. The bot's scope guardrail answered every one of them politely
 * ("I can only help with Razorveda products"), the client had no way to block or
 * delete anything, and the chat sat in their inbox for days.
 *
 * Uses OpenAI's moderation endpoint, which accepts images and is not billed, so
 * running it on every inbound image costs nothing. If no key is configured, or the
 * call fails or is slow, we report "not flagged" — a moderation outage must never
 * silence a paying customer.
 */

export interface ModerationResult {
  flagged: boolean;
  /** Category keys that tripped, e.g. ['sexual', 'sexual/minors']. */
  categories: string[];
  /** True when the content is sexual, which is what triggers a strike. */
  sexual: boolean;
  /** True when the model reported sexual content involving minors. */
  illegal: boolean;
}

const NOT_FLAGGED: ModerationResult = {
  flagged: false, categories: [], sexual: false, illegal: false,
};

const TIMEOUT_MS = 5000;

/**
 * Moderate an image (as a data URL or public URL) and/or a text message.
 *
 * Returns NOT_FLAGGED on any failure. Never throws.
 */
export async function moderateContent(input: {
  imageUrl?: string | null;
  text?: string | null;
}): Promise<ModerationResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  // Only the direct OpenAI key works here; OpenRouter does not proxy /moderations.
  if (!key || !key.startsWith('sk-')) return NOT_FLAGGED;

  const parts: Array<Record<string, unknown>> = [];
  if (input.text?.trim())  parts.push({ type: 'text', text: input.text.trim().slice(0, 2000) });
  if (input.imageUrl)      parts.push({ type: 'image_url', image_url: { url: input.imageUrl } });
  if (parts.length === 0)  return NOT_FLAGGED;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: parts }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error('[moderation] HTTP', res.status, await res.text().catch(() => ''));
      return NOT_FLAGGED;
    }

    const body = await res.json() as {
      results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
    };
    const result = body.results?.[0];
    if (!result) return NOT_FLAGGED;

    const categories = Object.entries(result.categories ?? {})
      .filter(([, hit]) => hit)
      .map(([name]) => name);

    return {
      flagged:    Boolean(result.flagged),
      categories,
      sexual:     categories.some((cat) => cat.startsWith('sexual')),
      illegal:    categories.includes('sexual/minors'),
    };
  } catch (err) {
    // Includes the abort — a slow moderation call must not hold up the reply.
    if ((err as Error)?.name !== 'AbortError') console.error('[moderation] failed', err);
    return NOT_FLAGGED;
  } finally {
    clearTimeout(timer);
  }
}

/** What the platform should do about a contact's latest offence. */
export type ModerationAction = 'none' | 'warn' | 'block';

/**
 * Decide the action for a contact who has just tripped moderation.
 *
 * The first offence only silences the bot and flags the chat, so a single wrong
 * call never costs the client a real customer — Razorveda sells skincare, and
 * someone photographing their own skin is a genuine enquiry. A second offence is
 * no longer plausibly a mistake, so the contact is blocked.
 *
 * Sexual content involving minors is blocked on the first occurrence; there is no
 * benign reading of it.
 */
export function decideModerationAction(
  result: ModerationResult,
  priorStrikes: number,
): ModerationAction {
  if (result.illegal) return 'block';
  if (!result.sexual) return 'none';
  return priorStrikes >= 1 ? 'block' : 'warn';
}

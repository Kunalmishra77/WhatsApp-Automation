// Central AI client — calls providers in priority order with AUTOMATIC FAILOVER.
// Primary = direct OpenAI (when OPENAI_API_KEY is a real sk- key), secondary =
// OpenRouter. If the primary fails for ANY reason that a retry can't fix — no
// credits (insufficient_quota), auth error, or exhausted rate-limit/timeout
// retries — the call automatically falls over to the next provider instead of
// returning null. This prevents a single provider's outage (e.g. OpenAI credits
// exhausted, or a per-minute rate-limit during a campaign burst) from silently
// degrading every workspace's auto-reply to the generic fallback.
// All API routes must import callAI() from here instead of calling a provider directly.

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CallAIOptions {
  model?: string;       // OpenRouter format: 'openai/gpt-4o-mini' — auto-converted for direct OpenAI
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

interface Provider {
  name: string;
  url: string;
  key: string;
  useOpenAI: boolean;   // direct-OpenAI needs the provider prefix stripped from model names
}

// Providers in priority order. OpenAI first (cheaper/direct when funded), OpenRouter
// as the always-on fallback. A provider is only listed when its key is present, so
// clearing OPENAI_API_KEY makes OpenRouter the sole/primary provider with no code change.
function getProviders(): Provider[] {
  const providers: Provider[] = [];

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey && openaiKey !== 'sk-placeholder' && openaiKey.startsWith('sk-')) {
    providers.push({
      name: 'OpenAI',
      url: 'https://api.openai.com/v1/chat/completions',
      key: openaiKey,
      useOpenAI: true,
    });
  }

  const orKey = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
  if (orKey) {
    providers.push({
      name: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: orKey,
      useOpenAI: false,
    });
  }

  return providers;
}

// Convert OpenRouter model name → direct OpenAI model name
// e.g. 'openai/gpt-4o-mini' → 'gpt-4o-mini'
//      'openai/gpt-4o'      → 'gpt-4o'
//      'anthropic/claude-3.5-sonnet' → falls back to 'gpt-4o-mini' when using direct OpenAI
function resolveModel(model: string, useOpenAI: boolean): string {
  if (!useOpenAI) return model; // OpenRouter accepts the full name

  // Direct OpenAI: strip provider prefix if it's openai/
  if (model.startsWith('openai/')) return model.replace('openai/', '');

  // If it's a non-OpenAI model but we're using direct OpenAI, fall back to gpt-4o-mini
  if (model.includes('/')) return 'gpt-4o-mini';

  return model; // already a direct model name like 'gpt-4o-mini'
}

// Transient failures worth retrying on the SAME provider: rate limits (429) and
// server errors (5xx). Client errors (4xx like 400 bad request / 401 auth) will
// never succeed on retry.
export function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

// A failure that a retry on the SAME provider can never fix — fail over immediately
// instead of burning the retry budget. Covers billing (no credits), auth, and
// permission errors. A plain rate-limit (429 without a quota/billing code) is NOT
// permanent — it's retried, then failed over if still failing.
function isPermanentProviderFailure(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  return /insufficient_quota|credit_balance_exhausted|billing_hard_limit_reached|account_deactivated/i.test(body);
}

const MAX_ATTEMPTS = 3;
// Per-request timeout kept tight so the full retry sequence stays within callers'
// budgets. Worst case for one provider = 8s + 0.5s + 8s + 1s + 8s ≈ 25.5s. Failover
// to a second provider only adds meaningful time when the FIRST provider times out
// repeatedly (rare) — a permanent failure (no credits / auth) short-circuits the
// primary's retries and fails over in well under a second, which is the common case
// this fix targets. The inbound-webhook auto-reply path is backstopped by the
// every-few-minutes reply-sweep watchdog regardless.
const REQUEST_TIMEOUT_MS = 8_000;

// Attempt ONE provider with retries. Returns the reply string on success, or null
// if this provider could not produce one (so the caller fails over to the next).
async function tryProvider(
  provider: Provider,
  body: Record<string, unknown>,
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(provider.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.key}`,
          'Content-Type': 'application/json',
          ...(provider.useOpenAI ? {} : { 'HTTP-Referer': 'https://agentix.in', 'X-Title': 'Agentix' }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content ?? null;
        if (content) return content;
        console.warn(`[AI] ${provider.name} returned empty content — will fail over if another provider exists`);
        return null;
      }

      const err = await res.text();
      console.error(`[AI] ${provider.name} error ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}):`, err.slice(0, 200));

      // No credits / auth / permission → retrying this provider is pointless; fail over now.
      if (isPermanentProviderFailure(res.status, err)) {
        console.warn(`[AI] ${provider.name} permanent failure — failing over immediately`);
        return null;
      }
      if (!isRetriableStatus(res.status) || attempt === MAX_ATTEMPTS) return null;
    } catch (err) {
      // Network error or timeout (AbortError) — transient, worth retrying.
      console.error(`[AI] ${provider.name} fetch error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err instanceof Error ? err.message : String(err));
      if (attempt === MAX_ATTEMPTS) return null;
    } finally {
      clearTimeout(timer);
    }
    // Backoff before the next attempt on the same provider (0.5s, then 1s).
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return null;
}

/**
 * Central AI call. Tries each configured provider in priority order, retrying
 * transient failures (429 / 5xx / network / timeout) per provider and failing over
 * to the next provider on any unrecoverable failure (no credits, auth, or exhausted
 * retries). Returns null only after ALL providers fail (unchanged contract).
 */
export async function callAI(
  messages: ChatMessage[],
  options: CallAIOptions = {},
): Promise<string | null> {
  const providers = getProviders();
  if (providers.length === 0) {
    console.error('[AI] No API key available (OPENAI_API_KEY or OPENROUTER_API_KEY)');
    return null;
  }

  const rawModel = options.model ?? 'openai/gpt-4o-mini';

  for (const [i, provider] of providers.entries()) {
    const body: Record<string, unknown> = {
      model: resolveModel(rawModel, provider.useOpenAI),
      messages,
      max_tokens:  options.maxTokens  ?? 1024,
      temperature: options.temperature ?? 0.7,
    };
    if (options.jsonMode) body.response_format = { type: 'json_object' };

    const reply = await tryProvider(provider, body);
    if (reply !== null) {
      if (i > 0) console.warn(`[AI] recovered via failover provider ${provider.name}`);
      return reply;
    }
    const next = providers[i + 1];
    if (next) {
      console.warn(`[AI] ${provider.name} failed — failing over to ${next.name}`);
    }
  }

  console.error('[AI] all providers failed — returning null (generic fallback will be used)');
  return null;
}

// Helper: the provider chain active right now, e.g. "OpenAI → OpenRouter".
export function getActiveProvider(): string {
  const chain = getProviders().map((p) => p.name);
  return chain.length ? chain.join(' → ') : 'none (no API key configured)';
}

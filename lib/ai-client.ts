// Central AI client — uses direct OpenAI if OPENAI_API_KEY is set, else OpenRouter fallback
// All API routes must import callAI() from here instead of calling OpenRouter directly.

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

function getProvider(): { url: string; key: string; useOpenAI: boolean } {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const isRealOpenAI = !!openaiKey && openaiKey !== 'sk-placeholder' && openaiKey.startsWith('sk-');

  if (isRealOpenAI) {
    return {
      url:       'https://api.openai.com/v1/chat/completions',
      key:       openaiKey!,
      useOpenAI: true,
    };
  }

  const orKey = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
  return {
    url:       'https://openrouter.ai/api/v1/chat/completions',
    key:       orKey ?? '',
    useOpenAI: false,
  };
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

// Transient failures worth retrying: rate limits (429) and server errors (5xx).
// Client errors (4xx like 400 bad request / 401 auth) will never succeed on retry.
export function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

const MAX_ATTEMPTS = 3;
// Per-request timeout kept tight so the full retry sequence stays within callers'
// budgets: worst case = 8s + 0.5s + 8s + 1s + 8s ≈ 25.5s, under the 30s maxDuration
// of the UI routes and comfortably ahead of the inbound-webhook auto-reply path
// (whose remaining misses the every-3-min reply-sweep watchdog backstops anyway).
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Central AI call. Retries transient failures (429 / 5xx / network / timeout) up
 * to MAX_ATTEMPTS with backoff so a hiccup during a campaign burst doesn't drop a
 * customer's reply. Returns null only after all attempts fail (unchanged contract).
 */
export async function callAI(
  messages: ChatMessage[],
  options: CallAIOptions = {},
): Promise<string | null> {
  const { url, key, useOpenAI } = getProvider();

  if (!key) {
    console.error('[AI] No API key available (OPENAI_API_KEY or OPENROUTER_API_KEY)');
    return null;
  }

  const rawModel = options.model ?? 'openai/gpt-4o-mini';
  const model    = resolveModel(rawModel, useOpenAI);

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens:  options.maxTokens  ?? 1024,
    temperature: options.temperature ?? 0.7,
  };
  if (options.jsonMode) body.response_format = { type: 'json_object' };

  const provider = useOpenAI ? 'OpenAI' : 'OpenRouter';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(useOpenAI ? {} : { 'HTTP-Referer': 'https://agentix.in', 'X-Title': 'Agentix' }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content ?? null;
      }

      const err = await res.text();
      console.error(`[AI] ${provider} error ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}):`, err.slice(0, 200));
      if (!isRetriableStatus(res.status) || attempt === MAX_ATTEMPTS) return null;
    } catch (err) {
      // Network error or timeout (AbortError) — transient, worth retrying.
      console.error(`[AI] fetch error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err instanceof Error ? err.message : String(err));
      if (attempt === MAX_ATTEMPTS) return null;
    } finally {
      clearTimeout(timer);
    }
    // Backoff before the next attempt (0.5s, then 1s).
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return null;
}

// Helper: which provider is active right now
export function getActiveProvider(): string {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey && openaiKey !== 'sk-placeholder' && openaiKey.startsWith('sk-')) {
    return 'OpenAI (direct, paid)';
  }
  return 'OpenRouter (fallback)';
}

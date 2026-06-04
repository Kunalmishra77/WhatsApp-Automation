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

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(useOpenAI ? {} : { 'HTTP-Referer': 'https://agentix.in', 'X-Title': 'Agentix' }),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[AI] ${useOpenAI ? 'OpenAI' : 'OpenRouter'} error ${res.status}:`, err.slice(0, 200));
      return null;
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error('[AI] Fetch error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Helper: which provider is active right now
export function getActiveProvider(): string {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey && openaiKey !== 'sk-placeholder' && openaiKey.startsWith('sk-')) {
    return 'OpenAI (direct, paid)';
  }
  return 'OpenRouter (fallback)';
}

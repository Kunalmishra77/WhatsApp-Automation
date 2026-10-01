// lib/ai-usage.ts
// Token + cost tracking for AI calls. logAiUsage() records one row per call
// (fire-and-forget); estimateCostUsd() prices it from a per-model table; and the
// OpenRouter balance helper powers the wallet + low-balance alert.

export interface UsageTokens {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

// USD per 1,000,000 tokens — { in, out }. Keys match resolved model names
// (OpenRouter style). Unknown models fall back to gpt-4o-mini pricing so cost is
// never silently zero. ':free' models are free. Keep roughly in sync with provider
// price pages — these are estimates for internal visibility, not billing.
const PRICING: Record<string, { in: number; out: number }> = {
  'openai/gpt-4o-mini':        { in: 0.15, out: 0.60 },
  'gpt-4o-mini':               { in: 0.15, out: 0.60 },
  'openai/gpt-4o':             { in: 2.50, out: 10.0 },
  'gpt-4o':                    { in: 2.50, out: 10.0 },
  'openai/gpt-4.1-mini':       { in: 0.40, out: 1.60 },
  'openai/gpt-4.1':            { in: 2.00, out: 8.00 },
  'anthropic/claude-3.5-sonnet': { in: 3.00, out: 15.0 },
  'whisper-1':                 { in: 0, out: 0 }, // priced per-minute, not tokens
};
const DEFAULT_PRICE = { in: 0.15, out: 0.60 };

export function estimateCostUsd(model: string | undefined, usage: UsageTokens): number {
  if (!model) model = 'openai/gpt-4o-mini';
  if (model.endsWith(':free')) return 0;
  const p = PRICING[model] ?? DEFAULT_PRICE;
  const inTok = usage.prompt_tokens ?? 0;
  const outTok = usage.completion_tokens ?? 0;
  return (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
}

interface LogUsageInput {
  provider: string;              // OpenAI | OpenRouter
  model?: string;
  task?: string;
  workspaceId?: string | null;
  usage?: UsageTokens | null;
}

// Records one usage row. Never throws and never blocks the caller — AI replies must
// not fail because logging did. No-op when there's nothing to record.
export async function logAiUsage(input: LogUsageInput): Promise<void> {
  try {
    const u = input.usage;
    if (!u || (!u.total_tokens && !u.prompt_tokens && !u.completion_tokens)) return;
    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;
    const total = u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
    await db.from('ai_usage').insert({
      workspace_id: input.workspaceId ?? null,
      provider: input.provider,
      model: input.model ?? null,
      task: input.task ?? null,
      prompt_tokens: u.prompt_tokens ?? 0,
      completion_tokens: u.completion_tokens ?? 0,
      total_tokens: total,
      cost_usd: estimateCostUsd(input.model, u),
    });
  } catch (err) {
    console.error('[ai-usage] log failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim());
}

// Live OpenRouter wallet. Tries /credits (prepaid credits) first, then /auth/key
// (usage vs limit) as a fallback. Returns remaining USD, or null if the key is
// missing or both endpoints fail (errors are logged so we can see why).
export async function fetchOpenRouterBalance(): Promise<{ remaining: number; totalCredits: number; totalUsage: number } | null> {
  const key = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
  if (!key) return null;
  const headers = { Authorization: `Bearer ${key}` };

  // Preferred: prepaid credits endpoint.
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', { headers });
    if (res.ok) {
      const data = await res.json() as { data?: { total_credits?: number; total_usage?: number } };
      const tc = Number(data.data?.total_credits);
      const tu = Number(data.data?.total_usage);
      if (Number.isFinite(tc) && Number.isFinite(tu)) return { remaining: tc - tu, totalCredits: tc, totalUsage: tu };
    } else {
      console.error('[ai-usage] OpenRouter /credits failed:', res.status, (await res.text()).slice(0, 200));
    }
  } catch (e) {
    console.error('[ai-usage] OpenRouter /credits error:', e instanceof Error ? e.message : e);
  }

  // Fallback: key-info endpoint (usage + optional limit).
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', { headers });
    if (res.ok) {
      const data = await res.json() as { data?: { usage?: number; limit?: number | null } };
      const usage = Number(data.data?.usage ?? 0);
      const limit = data.data?.limit;
      if (limit != null && Number.isFinite(Number(limit))) {
        return { remaining: Number(limit) - usage, totalCredits: Number(limit), totalUsage: usage };
      }
      // Pay-as-you-go (no limit) — remaining is effectively uncapped; report usage only.
      return { remaining: Number.POSITIVE_INFINITY, totalCredits: Number.POSITIVE_INFINITY, totalUsage: usage };
    }
    console.error('[ai-usage] OpenRouter /auth/key failed:', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error('[ai-usage] OpenRouter /auth/key error:', e instanceof Error ? e.message : e);
  }

  return null;
}

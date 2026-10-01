import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { AuthzError, authzResponse } from '@/lib/authz';
import { fetchOpenRouterBalance } from '@/lib/ai-usage';

export const runtime = 'nodejs';

// GET /api/admin/ai-usage?days=30
// Platform-admin AI token + cost dashboard: wallet per provider (OpenRouter live,
// OpenAI = admin-set balance minus spend since), totals, per-provider and per-client
// breakdown for the window.
export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const db = createAdminClient() as any;

    const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days')) || 30, 1), 365);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    const [totalsRes, providerRes, workspaceRes, balancesRes, orLive] = await Promise.all([
      db.rpc('ai_usage_totals', { p_from: fromISO, p_to: toISO }),
      db.rpc('ai_usage_by_provider', { p_from: fromISO, p_to: toISO }),
      db.rpc('ai_usage_by_workspace', { p_from: fromISO, p_to: toISO }),
      db.from('ai_provider_balances').select('provider, balance_usd, balance_set_at, low_threshold_usd'),
      fetchOpenRouterBalance(),
    ]);

    const totals = (totalsRes.data?.[0]) ?? { calls: 0, total_tokens: 0, cost_usd: 0 };
    const byProvider = providerRes.data ?? [];
    const byWorkspace = (workspaceRes.data ?? []).slice(0, 100);
    const balances = (balancesRes.data ?? []) as Array<{ provider: string; balance_usd: number | null; balance_set_at: string | null; low_threshold_usd: number }>;

    // Wallet per provider.
    const wallet: Array<{ provider: string; remaining: number | null; source: string; note?: string; low: boolean; threshold: number }> = [];

    // OpenRouter — live from its API.
    const orBal = balances.find((b) => b.provider === 'OpenRouter');
    const orThreshold = orBal?.low_threshold_usd ?? 5;
    if (orLive) {
      // Cache for the cron.
      await db.from('ai_provider_balances').update({ balance_usd: orLive.remaining, balance_set_at: toISO, updated_at: toISO }).eq('provider', 'OpenRouter');
      wallet.push({ provider: 'OpenRouter', remaining: Number(orLive.remaining.toFixed(2)), source: 'live', low: orLive.remaining < orThreshold, threshold: orThreshold });
    } else {
      wallet.push({ provider: 'OpenRouter', remaining: orBal?.balance_usd ?? null, source: 'cached', note: 'Live balance unavailable', low: (orBal?.balance_usd ?? Infinity) < orThreshold, threshold: orThreshold });
    }

    // OpenAI — no public balance API; admin sets balance on recharge, we subtract spend since.
    const oaBal = balances.find((b) => b.provider === 'OpenAI');
    const oaThreshold = oaBal?.low_threshold_usd ?? 5;
    if (oaBal?.balance_usd != null && oaBal.balance_set_at) {
      const { data: spendRows } = await db.rpc('ai_usage_by_provider', { p_from: oaBal.balance_set_at, p_to: toISO });
      const oaSpend = (spendRows ?? []).find((r: any) => r.provider === 'OpenAI')?.cost_usd ?? 0;
      const remaining = Number(oaBal.balance_usd) - Number(oaSpend);
      wallet.push({ provider: 'OpenAI', remaining: Number(remaining.toFixed(2)), source: 'estimated', note: `Set $${Number(oaBal.balance_usd).toFixed(2)}, est. spend $${Number(oaSpend).toFixed(2)} since`, low: remaining < oaThreshold, threshold: oaThreshold });
    } else {
      wallet.push({ provider: 'OpenAI', remaining: null, source: 'unset', note: 'Enter your OpenAI balance after each recharge to track it here.', low: false, threshold: oaThreshold });
    }

    return NextResponse.json({
      window: { days, from: fromISO, to: toISO },
      wallet,
      totals,
      by_provider: byProvider,
      by_workspace: byWorkspace,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminAIUsage GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/ai-usage  Body: { provider, balance_usd?, low_threshold_usd? }
// Set a provider's wallet balance (after a recharge) and/or its low-balance threshold.
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const { provider, balance_usd, low_threshold_usd } = await request.json() as {
      provider?: string; balance_usd?: number; low_threshold_usd?: number;
    };
    if (provider !== 'OpenAI' && provider !== 'OpenRouter') {
      return NextResponse.json({ error: 'provider must be OpenAI or OpenRouter' }, { status: 400 });
    }
    const db = createAdminClient() as any;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof balance_usd === 'number' && Number.isFinite(balance_usd)) {
      patch.balance_usd = balance_usd;
      patch.balance_set_at = new Date().toISOString();
      patch.last_alerted_for = null; // reset the alert dedupe on a fresh recharge
    }
    if (typeof low_threshold_usd === 'number' && Number.isFinite(low_threshold_usd)) {
      patch.low_threshold_usd = Math.max(0, low_threshold_usd);
    }
    const { error } = await db.from('ai_provider_balances').update(patch).eq('provider', provider);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminAIUsage POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

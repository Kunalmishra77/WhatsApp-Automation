// lib/ai-balance-alert.ts
// Checks each AI provider's wallet and emails platform admins once when it drops
// below its low-balance threshold (default $5). Dedupes via last_alerted_for so it
// doesn't nag daily — a recharge (admin POST) resets the flag so it can alert again.

import { fetchOpenRouterBalance } from '@/lib/ai-usage';
import { sendMail } from '@/lib/mailer';

interface BalanceRow {
  provider: string;
  balance_usd: number | null;
  balance_set_at: string | null;
  low_threshold_usd: number;
  last_alerted_for: number | null;
}

export async function checkAiBalancesAndAlert(db: any): Promise<{ checked: number; alerted: string[] }> {
  const alerted: string[] = [];
  const now = new Date().toISOString();

  const { data: rows } = await db
    .from('ai_provider_balances')
    .select('provider, balance_usd, balance_set_at, low_threshold_usd, last_alerted_for');
  const balances = (rows ?? []) as BalanceRow[];

  // Resolve a live/estimated remaining balance per provider.
  const remaining: Record<string, number | null> = { OpenAI: null, OpenRouter: null };

  const orLive = await fetchOpenRouterBalance();
  if (orLive) {
    remaining.OpenRouter = orLive.remaining;
    await db.from('ai_provider_balances').update({ balance_usd: orLive.remaining, balance_set_at: now, updated_at: now }).eq('provider', 'OpenRouter');
  }

  const oa = balances.find((b) => b.provider === 'OpenAI');
  if (oa?.balance_usd != null && oa.balance_set_at) {
    const { data: spend } = await db.rpc('ai_usage_by_provider', { p_from: oa.balance_set_at, p_to: now });
    const oaSpend = (spend ?? []).find((r: any) => r.provider === 'OpenAI')?.cost_usd ?? 0;
    remaining.OpenAI = Number(oa.balance_usd) - Number(oaSpend);
  }

  // Platform admin recipients.
  const { data: admins } = await db.from('profiles').select('email').eq('is_platform_admin', true);
  const to = ((admins ?? []) as Array<{ email: string | null }>).map((a) => a.email).filter(Boolean) as string[];

  for (const b of balances) {
    const rem = remaining[b.provider];
    const threshold = Number(b.low_threshold_usd ?? 5);
    if (rem == null || rem >= threshold) continue;
    if (b.last_alerted_for != null) continue; // already alerted this cycle (reset on recharge)

    if (to.length > 0) {
      await sendMail({
        to,
        subject: `⚠️ AGENTiX — ${b.provider} AI balance low ($${rem.toFixed(2)})`,
        html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2b4a">
          <h2 style="margin:0 0 12px;color:#b45309">AI credits running low</h2>
          <p style="color:#444;line-height:1.6">Your <strong>${b.provider}</strong> balance is about <strong>$${rem.toFixed(2)}</strong>, below the $${threshold.toFixed(2)} alert threshold.</p>
          <p style="color:#444;line-height:1.6">Please recharge soon so the AI bot keeps replying to customers. After recharging, update the balance in Admin → AI Tokens.</p>
        </div>`,
      }).catch(() => {});
    }
    await db.from('ai_provider_balances').update({ last_alerted_for: rem, updated_at: now }).eq('provider', b.provider);
    alerted.push(b.provider);
  }

  return { checked: balances.length, alerted };
}

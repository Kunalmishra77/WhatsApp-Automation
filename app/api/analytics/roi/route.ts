import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { microsToCurrency } from '@/lib/google-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ChannelRoi {
  channel: string;
  leads: number;
  conversions: number;
  conversion_rate: number;       // 0..100, one decimal
  spend: number;                 // whole currency units
  cost_per_lead: number | null;  // null when spend or leads is 0
  spend_kind: 'ad' | 'messaging' | null;
  revenue: number;               // realized value from converted leads (deal value ?? linked orders)
  roas: number | null;           // revenue / spend, 2 decimals; null when spend is 0
  net_roi: number | null;        // (revenue - spend) / spend * 100, one decimal; null when spend is 0
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/analytics/roi?workspaceId=&from=&to=
// Cross-channel marketing ROI: per-channel leads + conversions (from the Unified
// Lead Hub) joined with spend where a source exists — Google Ads / Meta (ad spend)
// and WhatsApp (messaging cost) — AND revenue from converted leads. Revenue per
// converted lead is its deal value (leads.value) when set, else the total of any
// non-cancelled orders linked to its conversation. Computes cost-per-lead,
// conversion rate, ROAS (revenue ÷ spend) and net ROI %.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const from = sp.get('from');
    const to = sp.get('to');

    // ── 0) Realized revenue from orders, mapped by conversation (fallback for
    //        converted leads with no deal value). Excludes cancelled/refunded. ──
    const orderRevenueByConversation = new Map<string, number>();
    {
      let oq = db
        .from('orders')
        .select('conversation_id, total_amount, status')
        .eq('workspace_id', workspaceId)
        .not('conversation_id', 'is', null)
        .not('status', 'in', '(cancelled,refunded)');
      const { data } = await oq.limit(10000);
      for (const r of (data ?? []) as Array<{ conversation_id: string | null; total_amount: number | null }>) {
        if (!r.conversation_id) continue;
        orderRevenueByConversation.set(
          r.conversation_id,
          (orderRevenueByConversation.get(r.conversation_id) ?? 0) + Number(r.total_amount ?? 0),
        );
      }
    }

    // ── 1) Leads + conversions + revenue by channel (exact, paginated) ───────
    const leadTotals = new Map<string, { leads: number; conversions: number; revenue: number }>();
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      let q = db.from('leads').select('channel, stage, value, conversation_id').eq('workspace_id', workspaceId);
      if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
      const { data, error } = await q.order('id', { ascending: true }).range(offset, offset + PAGE - 1);
      if (error) {
        console.error('[ROI leads]', error);
        return NextResponse.json({ error: 'Failed to aggregate leads' }, { status: 500 });
      }
      const rows = (data ?? []) as Array<{ channel: string | null; stage: string | null; value: number | null; conversation_id: string | null }>;
      for (const r of rows) {
        const ch = r.channel ?? 'other';
        const b = leadTotals.get(ch) ?? { leads: 0, conversions: 0, revenue: 0 };
        b.leads += 1;
        if (r.stage === 'converted') {
          b.conversions += 1;
          // Deal value wins; fall back to linked orders when it's unset/zero.
          const dealValue = Number(r.value ?? 0);
          const orderValue = r.conversation_id ? (orderRevenueByConversation.get(r.conversation_id) ?? 0) : 0;
          b.revenue += dealValue > 0 ? dealValue : orderValue;
        }
        leadTotals.set(ch, b);
      }
      if (rows.length < PAGE) break;
    }

    // ── 2) Google Ads spend (micros → currency) ─────────────────────────────
    let googleSpend = 0;
    {
      let gq = db.from('google_ads_campaigns').select('cost_micros, date').eq('workspace_id', workspaceId);
      if (from) gq = gq.gte('date', from);
      if (to) gq = gq.lte('date', to);
      const { data } = await gq.limit(10000);
      for (const r of (data ?? []) as Array<{ cost_micros: number }>) googleSpend += microsToCurrency(r.cost_micros);
    }

    // ── 3) WhatsApp messaging cost (meta_spend_daily; decimal currency) ─────
    let whatsappCost = 0;
    let currency = 'INR';
    {
      let mq = db.from('meta_spend_daily').select('cost, day, currency').eq('workspace_id', workspaceId);
      if (from) mq = mq.gte('day', from);
      if (to) mq = mq.lte('day', to);
      const { data } = await mq.limit(10000);
      for (const r of (data ?? []) as Array<{ cost: number; currency: string | null }>) {
        whatsappCost += Number(r.cost ?? 0);
        if (r.currency) currency = r.currency;
      }
    }

    // ── 4) Meta (Facebook/Instagram) ad spend ──────────────────────────────
    let metaAdSpend = 0;
    {
      let mq = db.from('meta_ad_spend_daily').select('spend, date').eq('workspace_id', workspaceId);
      if (from) mq = mq.gte('date', from);
      if (to) mq = mq.lte('date', to);
      const { data } = await mq.limit(10000);
      for (const r of (data ?? []) as Array<{ spend: number }>) metaAdSpend += Number(r.spend ?? 0);
    }

    const spendByChannel: Record<string, { spend: number; kind: 'ad' | 'messaging' }> = {
      google_ads: { spend: googleSpend, kind: 'ad' },
      meta_ads: { spend: metaAdSpend, kind: 'ad' },
      whatsapp: { spend: whatsappCost, kind: 'messaging' },
    };

    // ── Assemble per-channel rows ───────────────────────────────────────────
    const allChannels = new Set<string>([...leadTotals.keys(), ...Object.keys(spendByChannel)]);
    const channels: ChannelRoi[] = [];
    for (const ch of allChannels) {
      const t = leadTotals.get(ch) ?? { leads: 0, conversions: 0, revenue: 0 };
      const s = spendByChannel[ch];
      const spend = s ? round2(s.spend) : 0;
      const revenue = round2(t.revenue);
      channels.push({
        channel: ch,
        leads: t.leads,
        conversions: t.conversions,
        conversion_rate: t.leads > 0 ? round1((t.conversions / t.leads) * 100) : 0,
        spend,
        cost_per_lead: spend > 0 && t.leads > 0 ? round2(spend / t.leads) : null,
        spend_kind: s?.kind ?? null,
        revenue,
        roas: spend > 0 ? round2(revenue / spend) : null,
        net_roi: spend > 0 ? round1(((revenue - spend) / spend) * 100) : null,
      });
    }
    channels.sort((a, b) => b.revenue - a.revenue || b.leads - a.leads || b.spend - a.spend);

    const totals = channels.reduce(
      (acc, c) => ({
        leads: acc.leads + c.leads,
        conversions: acc.conversions + c.conversions,
        spend: acc.spend + c.spend,
        ad_spend: acc.ad_spend + (c.spend_kind === 'ad' ? c.spend : 0),
        revenue: acc.revenue + c.revenue,
      }),
      { leads: 0, conversions: 0, spend: 0, ad_spend: 0, revenue: 0 },
    );
    const totalSpend = round2(totals.spend);
    const totalRevenue = round2(totals.revenue);

    return NextResponse.json({
      channels,
      currency,
      totals: {
        ...totals,
        spend: totalSpend,
        revenue: totalRevenue,
        conversion_rate: totals.leads > 0 ? round1((totals.conversions / totals.leads) * 100) : 0,
        cost_per_lead: totals.ad_spend > 0 && totals.leads > 0
          ? round2(totals.ad_spend / totals.leads)
          : null,
        roas: totalSpend > 0 ? round2(totalRevenue / totalSpend) : null,
        net_roi: totalSpend > 0 ? round1(((totalRevenue - totalSpend) / totalSpend) * 100) : null,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[ROI GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

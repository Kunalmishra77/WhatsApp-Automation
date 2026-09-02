// lib/meta-rates.ts — single source of truth for Meta per-conversation billing rates
// (INR), backed by the public.meta_rates singleton row (database/migrations/084_meta_rates.sql).
// Previously hardcoded identically in app/api/admin/meta-billing/route.ts and
// modules/admin/components/MetaBillingOverview/index.tsx. Both now call getMetaRates()
// so a rate change in Admin Settings takes effect everywhere without a deploy.

export type MetaRates = {
  marketing: number;
  utility: number;
  auth: number;
  service: number;
};

export const DEFAULT_META_RATES: MetaRates = {
  marketing: 0.58,
  utility: 0.14,
  auth: 0.14,
  service: 0.29,
};

// Reads the meta_rates id=1 row via the passed admin client. Never throws — any error
// or missing row falls back to DEFAULT_META_RATES so billing math always has a value.
export async function getMetaRates(db: any): Promise<MetaRates> {
  try {
    const { data, error } = await db
      .from('meta_rates')
      .select('marketing, utility, auth, service')
      .eq('id', 1)
      .single();

    if (error || !data) return DEFAULT_META_RATES;

    return {
      marketing: Number(data.marketing),
      utility: Number(data.utility),
      auth: Number(data.auth),
      service: Number(data.service),
    };
  } catch {
    return DEFAULT_META_RATES;
  }
}

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { AuthzError, authzResponse } from '@/lib/authz';

export const runtime = 'nodejs';

// GET /api/admin/billing/plans — the 8 fixed billing_plans rows (2 channel keys x
// 4 terms) that the client-facing checkout and the billing sweep both price off of.
// Read-only, platform-admin only. Used by the admin Settings page to display current
// platform subscription pricing (informational — no writes here).
export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('billing_plans')
      .select('key, term, name, months, base_paise, total_paise, original_total_paise, includes_instagram')
      .order('key', { ascending: true })
      .order('months', { ascending: true });

    if (error) {
      console.error('[AdminBillingPlans GET] query failed', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ plans: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminBillingPlans GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

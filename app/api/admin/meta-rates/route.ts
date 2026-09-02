import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { AuthzError, authzResponse } from '@/lib/authz';
import { getMetaRates } from '@/lib/meta-rates';

export const runtime = 'nodejs';

interface RatesPatchBody {
  marketing?: unknown;
  utility?: unknown;
  auth?: unknown;
  service?: unknown;
}

// GET /api/admin/meta-rates — the singleton meta_rates row consumed by
// getMetaRates() everywhere Meta per-conversation billing is computed (meta-billing
// route + MetaBillingOverview cost preview). Platform-admin only.
export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = createAdminClient() as any;
    return NextResponse.json({ rates: await getMetaRates(db) });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminMetaRates GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/meta-rates — update the singleton meta_rates row. Platform-admin only.
export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const body = (await request.json().catch(() => ({}))) as RatesPatchBody;
    const patch: Record<string, number> = {};

    for (const key of ['marketing', 'utility', 'auth', 'service'] as const) {
      if (body[key] === undefined) continue;
      const v = Number(body[key]);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: `${key} must be a finite number >= 0` }, { status: 400 });
      }
      patch[key] = v;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Provide marketing, utility, auth, and/or service' }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('meta_rates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('marketing, utility, auth, service')
      .single();

    if (error) {
      console.error('[AdminMetaRates PATCH] update failed', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({
      rates: {
        marketing: Number(data.marketing),
        utility: Number(data.utility),
        auth: Number(data.auth),
        service: Number(data.service),
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminMetaRates PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { AuthzError, authzResponse } from '@/lib/authz';

export const runtime = 'nodejs';

interface ConfigPatchBody {
  grace_days?: unknown;
  reminder_days_before?: unknown;
}

// PATCH /api/admin/billing/config — update the singleton billing_config row
// (grace_days / reminder_days_before) consumed by nextBillingAction() in the daily
// billing-sweep cron. Platform-admin only.
export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const body = (await request.json().catch(() => ({}))) as ConfigPatchBody;
    const patch: Record<string, number> = {};

    if (body.grace_days !== undefined) {
      const v = Number(body.grace_days);
      if (!Number.isInteger(v) || v <= 0) {
        return NextResponse.json({ error: 'grace_days must be a positive integer' }, { status: 400 });
      }
      patch.grace_days = v;
    }
    if (body.reminder_days_before !== undefined) {
      const v = Number(body.reminder_days_before);
      if (!Number.isInteger(v) || v <= 0) {
        return NextResponse.json({ error: 'reminder_days_before must be a positive integer' }, { status: 400 });
      }
      patch.reminder_days_before = v;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Provide grace_days and/or reminder_days_before' }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('billing_config')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('grace_days, reminder_days_before')
      .single();

    if (error) {
      console.error('[AdminBillingConfig PATCH] update failed', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, config: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminBillingConfig PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

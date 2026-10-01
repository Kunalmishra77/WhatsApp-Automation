import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { AuthzError, authzResponse } from '@/lib/authz';
import { sendCatchupReply, type SweepRow } from '@/lib/reply-sweep';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/admin/recover-fallback  Body: { window_hours?, limit? }
// One-click (platform-admin) version of /api/cron/recover-fallback-replies — finds
// conversations whose last message is the generic fallback (e.g. after an AI-provider
// outage) and sends a real reply. Idempotent; respects the 24h WhatsApp window.
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const body = await request.json().catch(() => ({})) as { window_hours?: number; limit?: number };
    const windowHours = Math.min(Math.max(Number(body.window_hours) || 72, 1), 240);
    const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 500);

    const db = createAdminClient() as any;
    const { data, error } = await db.rpc('get_fallback_conversations', {
      p_window_hours: windowHours,
      p_inbound_window_hours: 24,
      p_limit: limit,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (Array.isArray(data) ? data : []) as SweepRow[];

    const tally = { total: rows.length, sent: 0, skipped: 0, failed: 0 };
    const perWorkspace: Record<string, { sent: number; skipped: number; failed: number }> = {};
    for (const row of rows) {
      const bumped: SweepRow = { ...row, last_at: new Date(new Date(row.last_at).getTime() + 1000).toISOString() };
      const result = await sendCatchupReply(db, bumped);
      tally[result]++;
      const wsName = row.business_name ?? row.workspace_id;
      const w = (perWorkspace[wsName] ??= { sent: 0, skipped: 0, failed: 0 });
      w[result]++;
    }

    return NextResponse.json({ ok: true, ...tally, perWorkspace });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminRecoverFallback]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

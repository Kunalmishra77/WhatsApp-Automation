import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/cron/cleanup-flow-sessions
//
// Expires flow sessions that are genuinely stuck, and drops finished ones past
// their retention window.
//
// It used to run its own query: mark `active` sessions older than 48 hours as
// `expired`. That rule is wrong in one specific way — a session parked on a
// 48-hour question timeout has not been updated for 48 hours *because it is
// waiting correctly*, so this would expire it moments before its wake-up came
// due and the follow-up would never be sent.
//
// The rule, including the "has a wake-up pending" guard, now lives in
// `cleanup_stale_flow_sessions` (migration 139), which pg_cron also calls every
// two hours. One rule in one place: two cleanups with slightly different ideas
// of "stale" is how a job came to be deleting the sessions it was meant to
// protect.
export async function GET(request: NextRequest) {
  const secret     = request.nextUrl.searchParams.get('secret') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createAdminClient() as any;
    const { data, error } = await db.rpc('cleanup_stale_flow_sessions');

    if (error) {
      console.error('[CleanupFlowSessions] RPC error:', error);
      return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }

    const result = (data ?? {}) as { expired?: number; purged?: number };
    console.log(
      `[CleanupFlowSessions] expired ${result.expired ?? 0} stuck session(s), ` +
      `purged ${result.purged ?? 0} past retention`,
    );

    return NextResponse.json({
      success: true,
      expired: result.expired ?? 0,
      purged: result.purged ?? 0,
    });
  } catch (err) {
    console.error('[CleanupFlowSessions] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

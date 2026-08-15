import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { sendCatchupReply, type SweepRow } from '@/lib/reply-sweep';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST/GET /api/cron/recover-fallback-replies
//   Auth: Bearer ${CRON_SECRET}  (or ?secret=${CRON_SECRET})
//   Params: ?limit=200&window_hours=96&inbound_window_hours=24
//
// One-off recovery for the 2026-08-14 AI-provider outage. Selects conversations
// whose latest message is the generic "get back to you shortly" fallback (sent while
// callAI() was failing on the exhausted OpenAI key) and, for each, sends a REAL reply
// using the exact same pipeline the missed-reply watchdog uses (sendCatchupReply →
// persona + KB + getAIReply, now on the working provider). Idempotent: once a real
// reply lands, that conversation's latest message is no longer the fallback, so a
// re-run won't re-select it. Respects the 24h WhatsApp window, bot_paused, opt-out,
// and business hours (all enforced by the RPC + sendCatchupReply).
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const qSecret = request.nextUrl.searchParams.get('secret');
  if (secret && auth !== `Bearer ${secret}` && qSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 500);
  const windowHours = Math.min(Math.max(Number(sp.get('window_hours')) || 96, 1), 240);
  const inboundWindowHours = Math.min(Math.max(Number(sp.get('inbound_window_hours')) || 24, 1), 24);

  const db = createAdminClient() as any;

  const { data, error } = await db.rpc('get_fallback_conversations', {
    p_window_hours: windowHours,
    p_inbound_window_hours: inboundWindowHours,
    p_limit: limit,
  });
  if (error) {
    console.error('[FallbackRecovery] rpc error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (Array.isArray(data) ? data : []) as SweepRow[];

  const tally = { total: rows.length, sent: 0, skipped: 0, failed: 0 };
  const perWorkspace: Record<string, { sent: number; skipped: number; failed: number }> = {};

  for (const row of rows) {
    // Bump last_at 1s past the fallback so sendCatchupReply's idempotency re-check
    // ("any outbound since last_at → skip") treats the fallback itself as handled and
    // only skips when a genuine reply has landed since (e.g. the customer messaged
    // again and the live webhook already answered).
    const bumped: SweepRow = {
      ...row,
      last_at: new Date(new Date(row.last_at).getTime() + 1000).toISOString(),
    };
    const result = await sendCatchupReply(db, bumped);
    tally[result]++;
    const wsName = row.business_name ?? row.workspace_id;
    const w = (perWorkspace[wsName] ??= { sent: 0, skipped: 0, failed: 0 });
    w[result]++;
  }

  console.log(`[FallbackRecovery] ${JSON.stringify(tally)}`);
  return NextResponse.json({ ok: true, ...tally, perWorkspace });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }

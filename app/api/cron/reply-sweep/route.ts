import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { findUnansweredConversations, sendCatchupReply } from '@/lib/reply-sweep';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Missed-reply watchdog. Scheduled by pg_cron every 3 minutes (migration 057).
// Answers any customer whose latest message went unanswered, across all workspaces.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient() as any;

  // Single-flight guard: claim a 2-minute lease so two overlapping cron
  // invocations can never both reply to the same conversation. The atomic
  // UPDATE ... WHERE locked_until < now() returns a row only to the winner.
  const nowIso = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const { data: claimed } = await supabase.from('reply_sweep_lock')
    .update({ locked_until: leaseUntil }).eq('id', 1).lt('locked_until', nowIso).select('id');
  if (!claimed || !claimed.length) {
    return NextResponse.json({ skipped: 'another sweep is running' });
  }

  try {
    const rows = await findUnansweredConversations(supabase, { minAgeMinutes: 2, windowHours: 24, limit: 200 });
    const deadline = Date.now() + 55_000; // stop cleanly before maxDuration
    let sent = 0, skipped = 0, failed = 0, processed = 0;
    for (const row of rows) {
      if (Date.now() > deadline) break; // remaining rows are picked up next sweep
      const r = await sendCatchupReply(supabase, row);
      if (r === 'sent') sent++;
      else if (r === 'skipped') skipped++;
      else failed++;
      processed++;
      await new Promise((res) => setTimeout(res, 150)); // gentle pacing on the AI/WhatsApp APIs
    }
    return NextResponse.json({ scanned: rows.length, processed, sent, skipped, failed });
  } finally {
    // Release the lease so the next scheduled sweep can claim it immediately.
    await supabase.from('reply_sweep_lock').update({ locked_until: new Date().toISOString() }).eq('id', 1);
  }
}

export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }

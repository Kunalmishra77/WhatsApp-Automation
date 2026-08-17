import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { findCsatCandidates, sendCsatPrompt } from '@/lib/auto-csat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Auto-CSAT sweep. Scheduled by pg_cron every 30 minutes (migration 078).
// Asks customers to rate a conversation once it has naturally wound down, in-window
// only. PER-RUN CAP of 30 — a hard ceiling so a single run can never mass-blast
// customers, even on the first run against a large backlog of quiet conversations.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient() as any;
  const deadline = Date.now() + 55_000; // stop cleanly before maxDuration

  const candidates = await findCsatCandidates(supabase, { limit: 30 });
  let sent = 0, skipped = 0, failed = 0;

  for (const candidate of candidates) {
    if (Date.now() > deadline) break; // remaining candidates are picked up next sweep
    const r = await sendCsatPrompt(supabase, candidate);
    if (r === 'sent') sent++;
    else if (r === 'skipped') skipped++;
    else failed++;
    await new Promise((res) => setTimeout(res, 200)); // gentle pacing on the WhatsApp API
  }

  return NextResponse.json({ scanned: candidates.length, sent, skipped, failed });
}

export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }

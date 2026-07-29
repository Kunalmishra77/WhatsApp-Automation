import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { findUnansweredConversations, sendCatchupReply } from '@/lib/reply-sweep';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Missed-reply watchdog. Scheduled by pg_cron every 3 minutes (migration 057).
// Answers any customer whose latest message went unanswered, across all workspaces.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient() as any;
  const rows = await findUnansweredConversations(supabase, { minAgeMinutes: 2, windowHours: 24, limit: 200 });

  let sent = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const r = await sendCatchupReply(supabase, row);
    if (r === 'sent') sent++;
    else if (r === 'skipped') skipped++;
    else failed++;
    await new Promise((res) => setTimeout(res, 150)); // gentle pacing on the AI/WhatsApp APIs
  }

  return NextResponse.json({ scanned: rows.length, sent, skipped, failed });
}

export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }

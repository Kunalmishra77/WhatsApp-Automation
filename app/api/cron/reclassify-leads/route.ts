import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { classifyLeadPipeline } from '@/lib/lead-classifier';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type LeadCandidate = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  ai_classified_at: string | null;
};

// Reclassification backstop. Scheduled by pg_cron every 15 minutes (migration 075).
// Covers leads whose classification is missing or stale relative to their
// conversation's latest message — e.g. the inbound-path classify call was
// skipped or failed — across all workspaces.
//
// NOTE: hasFeature(plan, 'crm') is a passthrough today under one-plan billing
// (every active workspace gets 'crm'), so no per-workspace plan filter is
// needed here — every stale, non-terminal lead with a conversation qualifies.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient() as any;
  const deadline = Date.now() + 55_000; // stop cleanly before maxDuration

  // Candidate leads: has a conversation, not in a terminal stage, oldest/never
  // classified first. Over-fetch beyond the 100-lead cap since some candidates
  // will turn out to still be fresh (classified after their conversation's last
  // message) and get skipped below without counting toward the cap.
  const { data: candidates } = await supabase
    .from('leads')
    .select('id, workspace_id, conversation_id, ai_classified_at')
    .not('conversation_id', 'is', null)
    .not('stage', 'in', '(converted,lost)')
    .order('ai_classified_at', { ascending: true, nullsFirst: true })
    .limit(300);

  const rows = (candidates ?? []) as LeadCandidate[];

  let scanned = 0;
  let processed = 0;
  for (const lead of rows) {
    if (processed >= 100) break;
    if (Date.now() > deadline) break;
    scanned++;

    const { data: conv } = await supabase
      .from('conversations')
      .select('last_message_at')
      .eq('id', lead.conversation_id)
      .single();

    const lastMessageAt = conv?.last_message_at ? new Date(conv.last_message_at as string).getTime() : null;
    const classifiedAt = lead.ai_classified_at ? new Date(lead.ai_classified_at).getTime() : null;
    const isStale = classifiedAt === null || (lastMessageAt !== null && lastMessageAt > classifiedAt);
    if (!isStale) continue;

    // Swallows and logs its own errors — never throws.
    await classifyLeadPipeline({
      conversationId: lead.conversation_id,
      workspaceId: lead.workspace_id,
      leadId: lead.id,
    });
    processed++;
    await sleep(150); // gentle pacing on the AI API
  }

  return NextResponse.json({ scanned, processed });
}

export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { classifyLeadPipeline } from '@/lib/lead-classifier';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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
// One-plan billing (lib/plan-features.ts hasFeature): every active workspace
// has CRM, so no per-workspace plan filter is needed here — matches the
// reply-sweep cron which also runs across all workspaces.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient() as any;
  const deadline = Date.now() + 55_000; // stop cleanly before maxDuration

  // Throughput: classify with bounded concurrency instead of one-at-a-time, so each
  // 55s run clears a large batch (a sequential loop only managed ~25/run, which made
  // backfilling a big historical backlog take days). Concurrency is kept moderate to
  // stay gentle on the AI provider; the run is near-idle once the backlog is cleared.
  const CONCURRENCY = 5;
  const PROCESS_CAP = 250;

  // Candidate leads: has a conversation, not in a terminal stage, oldest/never
  // classified first. Over-fetch beyond the cap since some candidates will turn out
  // to still be fresh (classified after their conversation's last message) and get
  // skipped below without counting toward the cap.
  const { data: candidates } = await supabase
    .from('leads')
    .select('id, workspace_id, conversation_id, ai_classified_at')
    .not('conversation_id', 'is', null)
    .not('stage', 'in', '(converted,lost)')
    .order('ai_classified_at', { ascending: true, nullsFirst: true })
    .limit(600);

  const rows = (candidates ?? []) as LeadCandidate[];

  // Batch the conversation lookup in one round-trip instead of one query per
  // candidate lead (avoids an N+1 of up to ~300 queries per run).
  const conversationIds = [...new Set(rows.map((r) => r.conversation_id))];
  const lastMessageAtById = new Map<string, string | null>();
  if (conversationIds.length > 0) {
    // Intentionally cross-workspace: `candidates` above spans every workspace (no
    // per-workspace filter, per the one-plan-billing note), so conversationIds can
    // too. This read is scoped by primary-key `id` (not workspace_id) and only
    // pulls `last_message_at` for staleness comparison below — nothing here is
    // ever written, and per-lead workspace scoping happens on every actual write
    // (classifyLeadPipeline's own .eq('workspace_id', ...) calls).
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, last_message_at')
      .in('id', conversationIds);
    for (const c of (convs ?? []) as { id: string; last_message_at: string | null }[]) {
      lastMessageAtById.set(c.id, c.last_message_at);
    }
  }

  // Keep only the stale candidates (missing classification, or classified before the
  // conversation's latest message), preserving the oldest-first order.
  const stale = rows.filter((lead) => {
    const rawLastMessageAt = lastMessageAtById.get(lead.conversation_id) ?? null;
    const lastMessageAt = rawLastMessageAt ? new Date(rawLastMessageAt).getTime() : null;
    const classifiedAt = lead.ai_classified_at ? new Date(lead.ai_classified_at).getTime() : null;
    return classifiedAt === null || (lastMessageAt !== null && lastMessageAt > classifiedAt);
  });

  // Bounded-concurrency worker pool: CONCURRENCY workers pull from a shared cursor
  // until the cap, the deadline, or the stale list is exhausted. classifyLeadPipeline
  // swallows and logs its own errors, so one bad lead never stops the pool.
  let cursor = 0;
  let processed = 0;
  async function worker() {
    while (cursor < stale.length && processed < PROCESS_CAP && Date.now() < deadline) {
      const lead = stale[cursor++]!;
      await classifyLeadPipeline({
        conversationId: lead.conversation_id,
        workspaceId: lead.workspace_id,
        leadId: lead.id,
      });
      processed++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return NextResponse.json({ scanned: stale.length, processed });
}

export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }

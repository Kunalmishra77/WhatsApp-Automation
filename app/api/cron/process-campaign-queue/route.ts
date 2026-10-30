import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { executeCampaign } from '@/lib/campaign-executor';
import { getBillingState } from '@/lib/billing-guard';
import { isRunStuck, STUCK_AFTER_MS } from '@/lib/campaign-stuck';

// GET /api/cron/process-campaign-queue?secret=<CRON_SECRET>
// Call from cron-job.org every 5 minutes.
// Processes ALL pending campaigns per run (not just one).
// Auto-resets jobs stuck in "processing" (cron timeout > 20 min ago) back to pending.
export async function GET(request: NextRequest) {
  const secret     = request.nextUrl.searchParams.get('secret') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const allowed    = !!cronSecret && secret === cronSecret;
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;

  // ── 1. Reset jobs that are genuinely stuck ──────────────────────────────────
  //
  // "started more than 20 minutes ago" was the wrong test, and it was the main
  // cause of 30,686 duplicate sends. It assumed a run going 20 minutes must be
  // a dead serverless request — but this deploys to Coolify, where nothing
  // kills a route handler, and real campaigns here run for HOURS. Measured on
  // production:
  //
  //   '22-24 Delivred Data'  18,449 recipients    118 min
  //   'razorveda 23-24'      15,664 recipients     94 min
  //   '22-24 (New)'           7,203 recipients  1,118 min
  //   'All 25-26'             2,286 recipients  2,910 min (48 h)
  //
  // So the reset fired over and over DURING a live send, handed the job back to
  // step 2 in the same tick, and a second executor started on a campaign the
  // first was still working through.
  //
  // The right test is "nothing has happened for 20 minutes", and the heartbeat
  // for that already exists: the executor writes `campaign_recipients.sent_at`
  // every 25 recipients. A job whose campaign sent something in the last 20
  // minutes is working, however long it has been going.
  //
  // The decision itself is in lib/campaign-stuck.ts with tests, because getting
  // it wrong is what sent 30,686 duplicate messages.
  const stuckCutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const { data: oldJobs } = await db
    .from('campaign_queue')
    .select('id, campaign_id, started_at')
    .eq('status', 'processing')
    .lt('started_at', stuckCutoff);

  const stuckJobs: Array<{ id: string; campaign_id: string }> = [];
  for (const job of (oldJobs ?? []) as Array<{ id: string; campaign_id: string; started_at: string | null }>) {
    // One row, newest send first — the campaign's heartbeat.
    const { data: lastSend } = await db
      .from('campaign_recipients')
      .select('sent_at')
      .eq('campaign_id', job.campaign_id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1);

    const lastSentAt = (lastSend as Array<{ sent_at: string }> | null)?.[0]?.sent_at ?? null;
    if (!isRunStuck({ startedAt: job.started_at, lastSentAt })) {
      console.log(`[CronQueue] Campaign ${job.campaign_id} is still working (last send ${lastSentAt ?? 'none'}) — leaving it alone`);
      continue;
    }
    stuckJobs.push({ id: job.id, campaign_id: job.campaign_id });
  }

  if (stuckJobs.length > 0) {
    console.log(`[CronQueue] Resetting ${stuckJobs.length} genuinely stuck job(s) to pending`);
    for (const job of stuckJobs) {
      await db.from('campaign_queue').update({ status: 'pending', started_at: null }).eq('id', job.id);
      // Back to draft so executeCampaign can claim it again; its dedup skips
      // whatever the dead run already sent.
      await db.from('campaigns').update({ status: 'draft' }).eq('id', job.campaign_id);
    }
  }

  // ── 2. Process ALL pending jobs ──────────────────────────────────────────────
  const { data: pendingJobs } = await db
    .from('campaign_queue')
    .select('id, campaign_id, workspace_id, total')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (!pendingJobs || pendingJobs.length === 0) {
    return NextResponse.json({ processed: 0, reset: stuckJobs.length, message: 'No pending campaigns' });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const job of pendingJobs) {
    // Suspension guard — skip campaigns for suspended/cancelled workspaces.
    // getBillingState fails open (isActive=true) on any DB error, so this
    // `continue` only fires on a clean, confirmed suspension. Job is left
    // 'pending' (not failed) so it resumes automatically once the workspace
    // is reactivated.
    const billing = await getBillingState(db, job.workspace_id);
    if (!billing.isActive) {
      console.log(`[CronQueue] Skipping campaign ${job.campaign_id} — workspace ${job.workspace_id} is suspended`);
      continue;
    }

    // Claim it, atomically. This was a select-then-update — the select above
    // and this write — so two ticks of this cron could each read the job as
    // pending and each run it. The `.eq('status', 'pending')` makes Postgres
    // serialise them: only one gets a row back.
    const { data: claimed } = await db.from('campaign_queue')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id');

    if (!Array.isArray(claimed) || claimed.length === 0) {
      console.log(`[CronQueue] Job ${job.id} was claimed by another run — skipping`);
      continue;
    }

    try {
      const result = await executeCampaign(job.campaign_id);

      await db.from('campaign_queue').update({
        status:       'completed',
        sent:         result.sent,
        failed:       result.failed,
        progress:     job.total,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);

      results.push({ id: job.campaign_id, ...result });
    } catch (err) {
      console.error(`[CronQueue] Campaign ${job.campaign_id} failed:`, err);
      await db.from('campaign_queue').update({ status: 'failed', error_message: String(err) }).eq('id', job.id);
      await db.from('campaigns').update({ status: 'failed' }).eq('id', job.campaign_id);
      results.push({ id: job.campaign_id, error: String(err) });
    }
  }

  return NextResponse.json({ processed: pendingJobs.length, reset: stuckJobs.length, results });
}

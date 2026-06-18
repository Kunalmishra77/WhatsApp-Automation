import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { executeCampaign } from '@/lib/campaign-executor';

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

  // ── 1. Reset stuck "processing" jobs (started > 20 min ago) ─────────────────
  const stuckCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: stuckJobs } = await db
    .from('campaign_queue')
    .select('id, campaign_id')
    .eq('status', 'processing')
    .lt('started_at', stuckCutoff);

  if (stuckJobs && stuckJobs.length > 0) {
    console.log(`[CronQueue] Resetting ${stuckJobs.length} stuck processing job(s) to pending`);
    for (const job of stuckJobs) {
      await db.from('campaign_queue').update({ status: 'pending', started_at: null }).eq('id', job.id);
      // Reset campaign status so executeCampaign's dedup logic handles partial sends
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
    return NextResponse.json({ processed: 0, reset: stuckJobs?.length ?? 0, message: 'No pending campaigns' });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const job of pendingJobs) {
    // Mark as processing
    await db.from('campaign_queue')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id);

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

  return NextResponse.json({ processed: pendingJobs.length, reset: stuckJobs?.length ?? 0, results });
}

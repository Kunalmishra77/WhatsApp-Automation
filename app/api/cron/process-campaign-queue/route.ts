import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { executeCampaign } from '@/lib/campaign-executor';

// GET /api/cron/process-campaign-queue?secret=agentix2026cron
// Processes one pending campaign from the queue per run (Vercel Hobby = daily cron).
// For more frequent processing, call this endpoint from cron-job.org every 30 minutes.
export async function GET(request: NextRequest) {
  const secret  = request.nextUrl.searchParams.get('secret') ?? '';
  const allowed = secret === 'agentix2026cron' || request.headers.get('x-vercel-cron') === '1';
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;

  // Pick the oldest pending job
  const { data: job } = await db
    .from('campaign_queue')
    .select('id, campaign_id, workspace_id, total')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!job) return NextResponse.json({ processed: 0, message: 'No pending campaigns' });

  // Mark as processing
  await db
    .from('campaign_queue')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', job.id);

  try {
    const result = await executeCampaign(job.campaign_id);

    await db
      .from('campaign_queue')
      .update({
        status:       'completed',
        sent:         result.sent,
        failed:       result.failed,
        progress:     job.total,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return NextResponse.json({ processed: 1, id: job.campaign_id, ...result });
  } catch (err) {
    await db
      .from('campaign_queue')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', job.id);

    // Reset campaign status
    await db.from('campaigns').update({ status: 'draft' }).eq('id', job.campaign_id);

    return NextResponse.json({ processed: 0, error: String(err) });
  }
}

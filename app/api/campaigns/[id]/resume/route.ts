import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/campaigns/[id]/resume
// Re-queues a stuck/failed/running campaign for processing.
// Dedup in executeCampaign skips contacts already sent — no double-sends.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const db = createAdminClient() as any;

    const { data: campaign } = await db
      .from('campaigns')
      .select('workspace_id, status, audience_type, audience_filter')
      .eq('id', campaignId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    // Clear any stuck queue entries for this campaign
    await db.from('campaign_queue')
      .update({ status: 'failed' })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing']);

    // Reset campaign to running state
    await db.from('campaigns')
      .update({ status: 'running' })
      .eq('id', campaignId);

    // Insert as 'processing' immediately so cron doesn't double-run it
    const { data: queueEntry } = await db.from('campaign_queue').insert({
      workspace_id: campaign.workspace_id,
      campaign_id:  campaignId,
      status:       'processing',
      started_at:   new Date().toISOString(),
      total:        0,
    }).select('id').single();

    // Fire executor immediately in background
    void (async () => {
      try {
        const { executeCampaign } = await import('@/lib/campaign-executor');
        const result = await executeCampaign(campaignId);
        if (queueEntry?.id) {
          await db.from('campaign_queue').update({
            status:       'completed',
            sent:         result.sent,
            failed:       result.failed,
            completed_at: new Date().toISOString(),
          }).eq('id', queueEntry.id);
        }
      } catch (err) {
        console.error('[Campaign Resume Background]', err);
        if (queueEntry?.id) {
          await db.from('campaign_queue').update({
            status:        'failed',
            error_message: String(err),
          }).eq('id', queueEntry.id);
        }
        await db.from('campaigns').update({ status: 'failed' }).eq('id', campaignId);
      }
    })();

    return NextResponse.json({ ok: true, message: 'Campaign started. Processing in background.' });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Resume]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { isRunStuck } from '@/lib/campaign-stuck';

// POST /api/campaigns/[id]/resume
//
// Takes over a campaign whose run has died, and sends the rest of it.
//
// It used to say "dedup in executeCampaign skips contacts already sent — no
// double-sends", and that reassurance was false: the dedup is a snapshot taken
// at the start of a run, so two live runs both read it before either had sent
// to the tail and both sent. 30,686 duplicate messages went out that way.
//
// So this now does two things it did not. It refuses while the campaign is
// still sending — resume is for a run that has stopped, and the person clicking
// it cannot see whether it has. And it stands the campaign down rather than
// setting it 'running' itself, because the executor's claim is the one thing
// preventing a second run and it would have refused the very run this starts.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const db = createAdminClient() as any;

    const { data: campaign } = await db
      .from('campaigns')
      .select('workspace_id, status, started_at, audience_type, audience_filter')
      .eq('id', campaignId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    // Is it actually stuck? `campaign_recipients.sent_at` is the heartbeat the
    // executor writes every 25 recipients, and the same test the queue cron
    // uses — one rule for "has this run died", in lib/campaign-stuck.ts.
    if (campaign.status === 'running') {
      const [{ data: lastSend }, { data: job }] = await Promise.all([
        db.from('campaign_recipients')
          .select('sent_at')
          .eq('campaign_id', campaignId)
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: false })
          .limit(1),
        db.from('campaign_queue')
          .select('started_at')
          .eq('campaign_id', campaignId)
          .eq('status', 'processing')
          .order('started_at', { ascending: false })
          .limit(1),
      ]);

      const lastSentAt = (lastSend as Array<{ sent_at: string }> | null)?.[0]?.sent_at ?? null;
      const startedAt = (job as Array<{ started_at: string | null }> | null)?.[0]?.started_at
        // No processing job: treat the campaign's own start as the clock, so a
        // run begun outside the queue is still judged rather than waved through.
        ?? (campaign.started_at as string | null) ?? null;

      if (!isRunStuck({ startedAt, lastSentAt })) {
        return NextResponse.json({
          error: lastSentAt
            ? 'This campaign is still sending. Wait for it to finish, or pause it first.'
            : 'This campaign has just started. Give it a few minutes before resuming it.',
        }, { status: 409 });
      }
    }

    // Clear any stuck queue entries for this campaign
    await db.from('campaign_queue')
      .update({ status: 'failed' })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing']);

    // Stand it down so executeCampaign's claim can take it. Deliberately NOT
    // set to 'running' here: that claim is what stops a second run, and it
    // refuses a campaign already marked running — including this one.
    await db.from('campaigns')
      .update({ status: 'draft' })
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

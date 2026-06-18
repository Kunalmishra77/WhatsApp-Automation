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

    if (campaign.status === 'completed') {
      return NextResponse.json({ error: 'Campaign already completed' }, { status: 409 });
    }

    // Clear any stuck queue entries for this campaign
    await db.from('campaign_queue')
      .update({ status: 'failed' })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing']);

    // Reset campaign to running state
    await db.from('campaigns')
      .update({ status: 'running' })
      .eq('id', campaignId);

    // Re-enqueue
    await db.from('campaign_queue').insert({
      workspace_id: campaign.workspace_id,
      campaign_id:  campaignId,
      status:       'pending',
      total:        0,
    });

    return NextResponse.json({ ok: true, message: 'Campaign re-queued. Processing will start within 5 minutes.' });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Resume]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

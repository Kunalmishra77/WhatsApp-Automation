import { type NextRequest, NextResponse } from 'next/server';
import { authzResponse, requireWorkspacePermission, AuthzError } from '@/lib/authz';
import { createAdminClient } from '@/services/supabase/admin';

// POST /api/campaigns/[id]/run
// Instead of executing synchronously (timeout risk), enqueues to campaign_queue.
// A cron job processes the queue in batches every day.
// For immediate small campaigns (<= 50 contacts) we still execute inline.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const db = createAdminClient() as any;

    const { data: campaign, error: campError } = await db
      .from('campaigns')
      .select('workspace_id, status, audience_type, audience_filter')
      .eq('id', campaignId)
      .single();

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    if (campaign.status === 'running') {
      return NextResponse.json({ error: 'Campaign already running' }, { status: 409 });
    }
    if (campaign.status === 'completed') {
      return NextResponse.json({ error: 'Campaign already completed' }, { status: 409 });
    }

    // Count audience to decide sync vs async
    let audienceCount = 0;
    {
      const filter = (campaign.audience_filter ?? {}) as Record<string, unknown>;
      let q = db.from('contacts').select('id', { count: 'exact', head: true })
        .eq('workspace_id', campaign.workspace_id)
        .eq('opted_out', false)
        .eq('is_blocked', false);
      if (campaign.audience_type === 'tag' && filter.tag) {
        q = q.contains('tags', [filter.tag]);
      } else if (campaign.audience_type === 'tags' && Array.isArray(filter.tags)) {
        q = q.overlaps('tags', filter.tags as string[]);
      }
      const { count } = await q;
      audienceCount = count ?? 0;
    }

    // Check campaign limit before running
    try {
      const { getWorkspacePlan, guardCampaignLimit } = await import('@/lib/plan-guard');
      const wsPlan = await getWorkspacePlan(campaign.workspace_id);
      await guardCampaignLimit(campaign.workspace_id, wsPlan);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PlanLimitError') {
        return NextResponse.json({ error: 'Monthly campaign limit reached. Please upgrade your plan.' }, { status: 402 });
      }
    }

    // Small campaigns (≤50): run synchronously as before
    if (audienceCount <= 50) {
      const { executeCampaign } = await import('@/lib/campaign-executor');
      const result = await executeCampaign(campaignId);
      void import('@/lib/usage-tracker').then(({ trackCampaignRun }) => trackCampaignRun(campaign.workspace_id)).catch(() => {});
      return NextResponse.json({ success: true, mode: 'sync', ...result });
    }

    // Large campaigns: enqueue for async processing
    const { data: existing } = await db
      .from('campaign_queue')
      .select('id, status')
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing'])
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Campaign already queued' }, { status: 409 });
    }

    await db.from('campaign_queue').insert({
      workspace_id: campaign.workspace_id,
      campaign_id:  campaignId,
      total:        audienceCount,
      status:       'pending',
    });
    void import('@/lib/usage-tracker').then(({ trackCampaignRun }) => trackCampaignRun(campaign.workspace_id)).catch(() => {});

    // Mark campaign as running
    await db.from('campaigns').update({ status: 'running' }).eq('id', campaignId);

    return NextResponse.json({
      success: true,
      mode: 'async',
      queued: true,
      total: audienceCount,
      message: `Campaign queued for ${audienceCount} contacts. Processing will start within the hour.`,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Run] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

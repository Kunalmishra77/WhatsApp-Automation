import { type NextRequest, NextResponse } from 'next/server';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';
import { executeCampaign } from '@/lib/campaign-executor';
import { createAdminClient } from '@/services/supabase/admin';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    const { data: campaign, error: campError } = await db
      .from('campaigns')
      .select('workspace_id, status')
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

    const result = await executeCampaign(campaignId);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message !== 'Internal server error') {
      return authzResponse(error);
    }
    console.error('[Campaign Run] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

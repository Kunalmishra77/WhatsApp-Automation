import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/campaigns/[id]/cancel
// Resets a stuck 'running' or 'scheduled' campaign back to 'failed' so it can be retried.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const db = createAdminClient() as any;

    const { data: campaign } = await db
      .from('campaigns')
      .select('workspace_id, status')
      .eq('id', campaignId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    if (campaign.status === 'completed') {
      return NextResponse.json({ error: 'Campaign already completed' }, { status: 409 });
    }

    const { error } = await db
      .from('campaigns')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', campaignId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Cancel]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

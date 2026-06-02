import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function DELETE(
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

    if (campaign.status === 'running') {
      return NextResponse.json({ error: 'Cannot delete a running campaign' }, { status: 409 });
    }

    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    // cascade deletes campaign_recipients too (ON DELETE CASCADE in migration)
    const { error } = await db.from('campaigns').delete().eq('id', campaignId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Delete]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

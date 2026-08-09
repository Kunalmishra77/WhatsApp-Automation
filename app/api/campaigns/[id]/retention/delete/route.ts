import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { confirmed } = await request.json() as { confirmed?: boolean };
    if (!confirmed) return NextResponse.json({ error: 'confirmed:true required' }, { status: 400 });

    const db = createAdminClient() as any;
    const { data: campaign } = await db.from('campaigns').select('workspace_id').eq('id', id).single();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    const { data: deleted, error } = await db.rpc('delete_campaign_data', { p_campaign_id: id });
    if (error) {
      console.error('[CampaignRetention delete rpc]', error);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted_recipients: deleted ?? 0, data_deleted_at: new Date().toISOString() });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[CampaignRetention delete]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

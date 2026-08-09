import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { computeRetention } from '@/lib/campaign-retention';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: campaign } = await db
      .from('campaigns')
      .select('workspace_id, created_at, completed_at, data_exported_at, data_deleted_at')
      .eq('id', id).single();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    const { count } = await db.from('campaign_recipients')
      .select('id', { count: 'exact', head: true }).eq('campaign_id', id);
    const r = computeRetention(campaign, new Date());
    return NextResponse.json({
      status: r.status,
      retention_at: r.retentionAt,
      days_remaining: r.daysRemaining,
      recipient_count: count ?? 0,
      data_exported_at: campaign.data_exported_at,
      data_deleted_at: campaign.data_deleted_at,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[CampaignRetention GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

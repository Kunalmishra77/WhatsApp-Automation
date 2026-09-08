import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

// GET /api/campaigns/[id]/queue-status?workspaceId=
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: campaignId } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'create_campaigns');
    const db = createAdminClient() as any;

    // Ownership: the campaign must belong to the authorized workspace, else a member of
    // one workspace could poll another workspace's queue by passing a foreign campaignId.
    const { data: camp } = await db
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!camp) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const { data } = await db
      .from('campaign_queue')
      .select('status, progress, total, sent, failed, started_at, completed_at, error_message')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json(data ?? { status: 'not_queued' });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

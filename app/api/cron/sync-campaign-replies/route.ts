import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';
import { backfillCampaignReplies } from '@/lib/campaign-reply-sync';

export const maxDuration = 60;

// Syncs missing campaign replies for campaigns completed in the last 48 hours.
// Catches replies that arrived faster than the campaign_recipients DB flush (race condition).
// Run every hour via Coolify cron: GET /api/cron/sync-campaign-replies
// Auth: Bearer ${CRON_SECRET} (all workspaces), or a workspace-admin session + ?workspaceId= (that workspace only)
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth   = request.headers.get('authorization');
  const isCron = !!secret && auth === `Bearer ${secret}`;

  let scopedWorkspaceId: string | null = null;
  if (!isCron) {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    try {
      await requireWorkspacePermission(workspaceId, 'create_campaigns');
    } catch (e) {
      return authzResponse(e);
    }
    scopedWorkspaceId = workspaceId;
  }

  const db = createAdminClient() as any;

  // Find campaigns completed in the last 48 hours
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  let query = db
    .from('campaigns')
    .select('id, workspace_id, name, completed_at')
    .eq('status', 'completed')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false });
  if (scopedWorkspaceId) query = query.eq('workspace_id', scopedWorkspaceId);
  const { data: campaigns } = await query;

  if (!campaigns?.length) {
    return NextResponse.json({ synced: 0, message: 'No recent campaigns to sync' });
  }

  let totalSynced = 0;

  for (const camp of campaigns) {
    try {
      const n = await backfillCampaignReplies(db, camp.id, camp.workspace_id);
      if (n > 0) console.log(`[SyncReplies] Campaign "${camp.name}": +${n} replies linked`);
      totalSynced += n;
    } catch (e) {
      console.error(`[SyncReplies] Campaign "${camp.name}" failed:`, e);
    }
  }

  return NextResponse.json({
    success: true,
    campaigns_checked: campaigns.length,
    total_replies_synced: totalSynced,
  });
}

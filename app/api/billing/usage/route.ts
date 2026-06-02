import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission } from '@/lib/authz';
import { createAdminClient } from '@/services/supabase/admin';
import { getUsage } from '@/lib/usage-tracker';
import { getLimits } from '@/lib/plan-features';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    // Check authorization
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // Get workspace plan
    const { data: workspaceData, error: wsError } = await db
      .from('workspaces')
      .select('plan, plan_limits')
      .eq('id', workspaceId)
      .single();

    if (wsError || !workspaceData) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const plan = (workspaceData.plan as string) ?? 'free';

    // Get current month usage
    const usageData = await getUsage(workspaceId);

    // Get plan limits
    const limits = getLimits(plan);

    // Calculate percentages
    const messagesUsed = usageData.messages_sent + usageData.messages_in;
    const messagesPct = Math.min(100, Math.round((messagesUsed / limits.maxMessages) * 100));
    const contactsPct = Math.min(100, Math.round((usageData.contacts_created / limits.maxContacts) * 100));
    const campaignsPct = Math.min(100, Math.round((usageData.campaigns_run / limits.maxCampaigns) * 100));

    return NextResponse.json({
      plan,
      month: usageData.month,
      usage: {
        messages: {
          used: messagesUsed,
          limit: limits.maxMessages,
          pct: messagesPct,
        },
        contacts: {
          used: usageData.contacts_created,
          limit: limits.maxContacts,
          pct: contactsPct,
        },
        campaigns: {
          used: usageData.campaigns_run,
          limit: limits.maxCampaigns,
          pct: campaignsPct,
        },
      },
    });
  } catch (err) {
    console.error('[billing/usage] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

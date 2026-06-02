import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { getLimits } from '@/lib/plan-features';

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  subscription_status: string;
  owner_email: string | null;
  created_at: string;
  messages_this_month: number;
  member_count: number;
  plan_limit_messages: number;
  custom_domain: string | null;
}

export async function GET(_request: NextRequest) {
  try {
    // 1. Get current user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Check is_platform_admin
    const db = createAdminClient() as any;
    const { data: profile } = await db
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();
    if (!profile?.is_platform_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Fetch all workspaces
    const { data: workspaces, error: wsError } = await db
      .from('workspaces')
      .select('id, name, slug, plan, plan_limits, is_active, subscription_status, owner_email, created_at, custom_domain')
      .order('created_at', { ascending: false });

    if (wsError) {
      console.error('[admin/workspaces] workspaces query error:', wsError);
      return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ workspaces: [] });
    }

    const workspaceIds: string[] = workspaces.map((w: any) => w.id);
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. '2026-06'

    // 4. Fetch usage logs for current month
    const { data: usageLogs } = await db
      .from('platform_usage_logs')
      .select('workspace_id, messages_sent')
      .eq('month', currentMonth)
      .in('workspace_id', workspaceIds);

    const usageMap = new Map<string, number>();
    if (usageLogs) {
      for (const log of usageLogs) {
        usageMap.set(log.workspace_id, log.messages_sent ?? 0);
      }
    }

    // 5. Fetch member counts
    const { data: memberCounts } = await db
      .from('workspace_members')
      .select('workspace_id')
      .in('workspace_id', workspaceIds);

    const memberMap = new Map<string, number>();
    if (memberCounts) {
      for (const m of memberCounts) {
        memberMap.set(m.workspace_id, (memberMap.get(m.workspace_id) ?? 0) + 1);
      }
    }

    // 6. Assemble response
    const result: WorkspaceRow[] = workspaces.map((w: any) => {
      const limits = getLimits(w.plan ?? 'free');
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        plan: w.plan ?? 'free',
        is_active: w.is_active ?? true,
        subscription_status: w.subscription_status ?? 'active',
        owner_email: w.owner_email ?? null,
        created_at: w.created_at,
        messages_this_month: usageMap.get(w.id) ?? 0,
        member_count: memberMap.get(w.id) ?? 0,
        plan_limit_messages: limits.maxMessages,
        custom_domain: w.custom_domain ?? null,
      };
    });

    return NextResponse.json({ workspaces: result });
  } catch (err) {
    console.error('[admin/workspaces] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

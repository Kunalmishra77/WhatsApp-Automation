import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { PLAN_DISPLAY } from '@/lib/plan-features';

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
      .select('id, plan, is_active, subscription_status');

    if (wsError) {
      console.error('[admin/stats] workspaces query error:', wsError);
      return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
    }

    const total_workspaces = workspaces?.length ?? 0;
    const active_workspaces = workspaces?.filter((w: any) => w.is_active && w.subscription_status === 'active').length ?? 0;
    const halted_workspaces = workspaces?.filter((w: any) => w.subscription_status === 'halted').length ?? 0;

    // MRR: sum of active paid plan prices
    const mrr = (workspaces ?? []).reduce((acc: number, w: any) => {
      if (!w.is_active || w.subscription_status !== 'active') return acc;
      const planKey = (w.plan ?? 'free') as keyof typeof PLAN_DISPLAY;
      const price = PLAN_DISPLAY[planKey]?.price ?? 0;
      return acc + price;
    }, 0);

    // 4. Fetch messages for current month
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: usageLogs } = await db
      .from('platform_usage_logs')
      .select('messages_sent')
      .eq('month', currentMonth);

    const messages_today = (usageLogs ?? []).reduce(
      (acc: number, log: any) => acc + (log.messages_sent ?? 0),
      0
    );

    return NextResponse.json({
      total_workspaces,
      active_workspaces,
      halted_workspaces,
      mrr,
      messages_today,
    });
  } catch (err) {
    console.error('[admin/stats] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

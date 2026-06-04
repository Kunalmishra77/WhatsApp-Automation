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
  conversations_count: number;
  contacts_count: number;
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

    // 3. Fetch all workspaces (exclude internal/admin workspaces)
    const { data: workspaces, error: wsError } = await db
      .from('workspaces')
      .select('id, name, slug, plan, plan_limits, is_active, subscription_status, owner_email, created_at, custom_domain')
      .neq('subscription_status', 'internal')
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

    // 5. Fetch member counts, conversations counts, and contacts counts in parallel
    const [memberCountsResult, conversationsResult, contactsResult] = await Promise.all([
      db.from('workspace_members').select('workspace_id').in('workspace_id', workspaceIds),
      db.from('conversations').select('workspace_id').in('workspace_id', workspaceIds),
      db.from('contacts').select('workspace_id').in('workspace_id', workspaceIds),
    ]);

    const memberMap = new Map<string, number>();
    if (memberCountsResult.data) {
      for (const m of memberCountsResult.data) {
        memberMap.set(m.workspace_id, (memberMap.get(m.workspace_id) ?? 0) + 1);
      }
    }

    const conversationsMap = new Map<string, number>();
    if (conversationsResult.data) {
      for (const c of conversationsResult.data) {
        conversationsMap.set(c.workspace_id, (conversationsMap.get(c.workspace_id) ?? 0) + 1);
      }
    }

    const contactsMap = new Map<string, number>();
    if (contactsResult.data) {
      for (const c of contactsResult.data) {
        contactsMap.set(c.workspace_id, (contactsMap.get(c.workspace_id) ?? 0) + 1);
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
        conversations_count: conversationsMap.get(w.id) ?? 0,
        contacts_count: contactsMap.get(w.id) ?? 0,
      };
    });

    return NextResponse.json({ workspaces: result });
  } catch (err) {
    console.error('[admin/workspaces] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/workspaces — delete ALL workspaces + their auth users (platform reset)
export async function DELETE(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createAdminClient() as any;
    const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
    if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Get all members across all workspaces (to delete their auth accounts)
    const { data: allMembers } = await db.from('workspace_members').select('user_id').neq('user_id', user.id);

    // Delete all workspaces (cascades to all related data)
    await db.from('workspaces').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

    // Delete auth users who are NOT the current platform admin
    const deletedCount = { workspaces: 0, users: 0 };
    if (allMembers?.length) {
      const uniqueUserIds = [...new Set((allMembers as Array<{ user_id: string }>).map((m) => m.user_id))];
      for (const uid of uniqueUserIds) {
        if (uid !== user.id) {
          await db.auth.admin.deleteUser(uid);
          deletedCount.users++;
        }
      }
    }

    return NextResponse.json({ success: true, deleted: deletedCount });
  } catch (err) {
    console.error('[admin/workspaces/deleteAll]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

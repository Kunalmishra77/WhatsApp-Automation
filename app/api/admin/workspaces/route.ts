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
  deleted_at: string | null;
  messages_this_month: number;
  member_count: number;
  plan_limit_messages: number;
  custom_domain: string | null;
  conversations_count: number;
  contacts_count: number;
}

export async function GET(request: NextRequest) {
  try {
    const trash = request.nextUrl.searchParams.get('trash') === 'true';

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

    // 3. Fetch workspaces — active list OR trash bin
    let wsQuery = db
      .from('workspaces')
      .select('id, name, slug, plan, plan_limits, is_active, subscription_status, owner_email, created_at, deleted_at, custom_domain')
      .neq('subscription_status', 'internal')
      .order('created_at', { ascending: false });

    if (trash) {
      wsQuery = wsQuery.not('deleted_at', 'is', null);
    } else {
      wsQuery = wsQuery.is('deleted_at', null);
    }

    const { data: workspaces, error: wsError } = await wsQuery;

    if (wsError) {
      console.error('[admin/workspaces] workspaces query error:', wsError);
      return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ workspaces: [] });
    }

    const workspaceIds: string[] = workspaces.map((w: any) => w.id);
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. '2026-06'

    // 4. Count ALL-TIME messages per workspace using COUNT queries (bypasses 1000-row limit)
    // Use platform_usage_logs for monthly summary, fall back to direct count
    const usageMap = new Map<string, number>();
    // Fetch total message count per workspace in batches to avoid 1000-row limit
    for (let bi = 0; bi < workspaceIds.length; bi += 10) {
      const batchIds = workspaceIds.slice(bi, bi + 10);
      const batchResults = await Promise.all(batchIds.map((wsId: string) =>
        db.from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
      ));
      batchIds.forEach((wsId: string, idx: number) => {
        const cnt = batchResults[idx]?.count ?? 0;
        if (cnt > 0) usageMap.set(wsId, cnt);
      });
    }

    // 5. Fetch counts via a single aggregation RPC (replaces 3 full-table scans)
    const { data: statsRows } = await db.rpc('get_workspace_stats', { workspace_ids: workspaceIds });

    const memberMap        = new Map<string, number>();
    const conversationsMap = new Map<string, number>();
    const contactsMap      = new Map<string, number>();

    if (statsRows) {
      for (const row of statsRows as Array<{ workspace_id: string; member_count: number; conversation_count: number; contact_count: number }>) {
        memberMap.set(row.workspace_id,        Number(row.member_count));
        conversationsMap.set(row.workspace_id, Number(row.conversation_count));
        contactsMap.set(row.workspace_id,      Number(row.contact_count));
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
        deleted_at: w.deleted_at ?? null,
        messages_this_month: usageMap.get(w.id) ?? 0,  // all-time count (platform started this month)
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

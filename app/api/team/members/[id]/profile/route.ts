import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { resolveMemberAccess } from '@/lib/permissions';

// GET /api/team/members/[id]/profile?workspaceId=
//
// Everything the member profile page shows in one call: who they are, the access
// they actually hold (resolved the same way the API gates resolve it, so the page
// can never claim access the server would refuse), and their work — tasks,
// the clients they own, their open conversations and their recent activity.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    // Anyone who can see the team can open a colleague's profile; editing access
    // is gated separately on the PATCH route.
    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;

    const { data: member } = await db
      .from('workspace_members')
      .select(`
        id, user_id, role, title, is_online, is_suspended, joined_at, last_active_at,
        custom_role_id, page_access, permission_overrides, max_chats,
        profiles!workspace_members_user_id_fkey(full_name, email, avatar_url)
      `)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const userId: string = member.user_id;

    const [access, tasks, clients, conversations, activity, customRole] = await Promise.all([
      resolveMemberAccess(workspaceId, userId),
      db.from('tasks')
        .select('id, title, status, priority, due_date, completed_at, created_at')
        .eq('workspace_id', workspaceId).eq('assigned_to', userId)
        .order('created_at', { ascending: false }).limit(100),
      db.from('contacts')
        .select('id, name, phone, company, tags, created_at')
        .eq('workspace_id', workspaceId).eq('owner_id', userId)
        .order('created_at', { ascending: false }).limit(100),
      db.from('conversations')
        .select('id, status, last_message_at, contact:contacts!contact_id(id, name, phone)')
        .eq('workspace_id', workspaceId).eq('assigned_agent_id', userId)
        .order('last_message_at', { ascending: false }).limit(50),
      db.from('activities')
        .select('id, action, entity_type, entity_id, entity_label, metadata, created_at')
        .eq('workspace_id', workspaceId).eq('actor_id', userId)
        .order('created_at', { ascending: false }).limit(50),
      member.custom_role_id
        ? db.from('workspace_roles').select('id, name').eq('id', member.custom_role_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const now = Date.now();
    const isOverdue = (t: { status: string; due_date: string | null }) =>
      t.status !== 'done' && t.due_date !== null && new Date(t.due_date).getTime() < now;

    // `overdue` is resolved here rather than in the browser so the profile page
    // renders purely from its props.
    const taskRows = ((tasks.data ?? []) as Array<{ status: string; due_date: string | null }>)
      .map((t) => ({ ...t, overdue: isOverdue(t) }));

    return NextResponse.json({
      member: {
        id:          member.id,
        user_id:     userId,
        role:        member.role,
        title:       member.title,
        full_name:   member.profiles?.full_name ?? null,
        email:       member.profiles?.email ?? null,
        avatar_url:  member.profiles?.avatar_url ?? null,
        is_online:   member.is_online,
        is_suspended: member.is_suspended,
        joined_at:   member.joined_at,
        last_active_at: member.last_active_at,
        max_chats:   member.max_chats,
        custom_role_id:   member.custom_role_id,
        custom_role_name: customRole?.data?.name ?? null,
        // Raw config, so the access editor can show exactly what is stored.
        page_access:          member.page_access,
        permission_overrides: member.permission_overrides ?? {},
      },
      // Resolved — what this member can actually do right now.
      access: {
        permissions: access?.permissions ?? [],
        pageAccess:  access?.pageAccess ?? null,
      },
      tasks:         taskRows,
      clients:       clients.data ?? [],
      conversations: conversations.data ?? [],
      activity:      activity.data ?? [],
      stats: {
        tasks_open:      taskRows.filter((t) => t.status !== 'done').length,
        tasks_done:      taskRows.filter((t) => t.status === 'done').length,
        tasks_overdue:   taskRows.filter((t) => t.overdue).length,
        clients:         (clients.data ?? []).length,
        conversations:   (conversations.data ?? []).length,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MemberProfile GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

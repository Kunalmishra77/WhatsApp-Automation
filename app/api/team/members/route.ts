import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/team/members?workspaceId=
// Returns workspace members with profile data (name, email, avatar).
// Uses admin client to bypass RLS on the profiles table.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('workspace_members')
      .select(`
        id, user_id, role, is_online, title, is_suspended, joined_at, last_active_at, max_chats,
        custom_role_id, page_access,
        profiles(full_name, email, avatar_url),
        custom_role:workspace_roles!custom_role_id(id, name)
      `)
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const members = ((data ?? []) as Array<{
      id: string;
      user_id: string;
      role: string;
      is_online: boolean;
      title: string | null;
      is_suspended: boolean;
      joined_at: string | null;
      last_active_at: string | null;
      max_chats: number | null;
      custom_role_id: string | null;
      page_access: string[] | null;
      profiles: { full_name: string; email: string; avatar_url: string | null } | null;
      custom_role: { id: string; name: string } | null;
    }>).map((m) => ({
      id:         m.id,
      user_id:    m.user_id,
      role:       m.role,
      is_online:  m.is_online,
      full_name:  m.profiles?.full_name ?? null,
      email:      m.profiles?.email ?? null,
      avatar_url: m.profiles?.avatar_url ?? null,
      max_chats:        m.max_chats ?? 0,
      title:            m.title ?? null,
      is_suspended:     Boolean(m.is_suspended),
      joined_at:        m.joined_at ?? null,
      last_active_at:   m.last_active_at ?? null,
      custom_role_id:   m.custom_role_id ?? null,
      custom_role_name: m.custom_role?.name ?? null,
      // null = this member is not page-restricted.
      page_access:      m.page_access ?? null,
    }));

    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Team Members]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

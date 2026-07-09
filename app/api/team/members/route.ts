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
      .select('id, user_id, role, is_online, profiles(full_name, email, avatar_url)')
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const members = ((data ?? []) as Array<{
      id: string;
      user_id: string;
      role: string;
      is_online: boolean;
      profiles: { full_name: string; email: string; avatar_url: string | null } | null;
    }>).map((m) => ({
      id:         m.id,
      user_id:    m.user_id,
      role:       m.role,
      is_online:  m.is_online,
      full_name:  m.profiles?.full_name ?? null,
      email:      m.profiles?.email ?? null,
      avatar_url: m.profiles?.avatar_url ?? null,
    }));

    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Team Members]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

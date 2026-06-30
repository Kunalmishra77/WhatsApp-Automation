import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { createAdminClient } from '@/services/supabase/admin';
import { DEFAULT_AGENT_ALLOWED_PAGES, type AgentPageKey } from '@/lib/agent-pages';

// Page-level guard for restricted pages (Team, Analytics, Campaigns, etc).
// RLS stops data leaks, but doesn't stop the 'agent' role from navigating to a
// page directly by URL and seeing a broken/empty screen — this redirects before
// the page even renders, mirroring DashboardLayout's own cookie-based
// active-workspace resolution so the check matches what the user is looking at.
//
// Only the 'agent' role is ever restricted here — every other role always
// passes. Which pages an agent CAN see is admin-configurable per workspace
// (workspaces.settings.agent_page_access, edited from the Team page), not
// hardcoded, so an admin decides exactly what their employees can access.
export async function requirePageRole(pageKey: AgentPageKey): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/login');

  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect('/workspace/new');

  const cookieStore = await cookies();
  const preferredId = cookieStore.get('active_workspace_id')?.value;
  const activeWorkspace = (preferredId ? workspaces.find((w) => w.id === preferredId) : undefined) ?? workspaces[0]!;

  const db = createAdminClient() as any;
  const { data: member } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', activeWorkspace.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (member?.role !== 'agent') return;

  const { data: ws } = await db.from('workspaces').select('settings').eq('id', activeWorkspace.id).maybeSingle();
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  const allowed = (settings.agent_page_access as AgentPageKey[] | undefined) ?? DEFAULT_AGENT_ALLOWED_PAGES;

  if (!allowed.includes(pageKey)) {
    redirect('/conversations');
  }
}

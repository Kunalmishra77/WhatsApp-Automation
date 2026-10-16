import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { resolveMemberAccess, canOpenPage } from '@/lib/permissions';
import { type AgentPageKey } from '@/lib/agent-pages';

// Page-level guard for restricted pages (Team, Analytics, Campaigns, etc).
// RLS stops data leaks, but doesn't stop the 'agent' role from navigating to a
// page directly by URL and seeing a broken/empty screen — this redirects before
// the page even renders, mirroring DashboardLayout's own cookie-based
// active-workspace resolution so the check matches what the user is looking at.
//
// Access is admin-configurable, not hardcoded: a member's own page list wins,
// then their custom role's, then — for agents — the workspace default. Members
// with no list configured (admins, managers by default) are unrestricted, so
// this only ever narrows access that an admin chose to narrow.
export async function requirePageRole(pageKey: AgentPageKey): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/login');

  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect('/workspace/new');

  const cookieStore = await cookies();
  const preferredId = cookieStore.get('active_workspace_id')?.value;
  const activeWorkspace = (preferredId ? workspaces.find((w) => w.id === preferredId) : undefined) ?? workspaces[0]!;

  // Page access is resolved by the same code that guards the API routes
  // (lib/permissions.ts), so the two can never disagree: a member override, a
  // custom role's list, or — for agents — the workspace default.
  const access = await resolveMemberAccess(activeWorkspace.id, user.id);
  if (!access) redirect('/workspace/select');
  if (access.isSuspended) redirect('/workspace-unavailable');

  if (!canOpenPage(access, pageKey)) {
    redirect('/conversations');
  }
}

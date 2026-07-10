import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { AppShell } from '@/components/layout/AppShell';
import { StoreInitializer } from '@/components/StoreInitializer';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { getProfile } from '@/modules/auth/services/profile.service';
import { createAdminClient } from '@/services/supabase/admin';
import { ROUTES } from '@/lib/constants';
import {
  SESSION_COOKIE_NAME,
  createSession,
  validateSession,
} from '@/lib/session';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await getUser();
  if (!user) redirect(ROUTES.LOGIN);

  const db = createAdminClient() as any;

  // Platform admins always go to /admin
  const { data: adminCheck } = await db
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();
  if (adminCheck?.is_platform_admin) redirect('/admin');

  const [workspaces, profile] = await Promise.all([
    getUserWorkspaces(user.id),
    getProfile(user.id),
  ]);
  if (workspaces.length === 0) redirect(ROUTES.WORKSPACE_NEW);

  const initUser = {
    id:         user.id,
    email:      user.email ?? '',
    full_name:  profile?.full_name ?? (user.user_metadata['full_name'] as string | undefined) ?? '',
    avatar_url: profile?.avatar_url ?? (user.user_metadata['avatar_url'] as string | undefined) ?? null,
  };

  const cookieStore  = await cookies();
  const preferredId  = cookieStore.get('active_workspace_id')?.value;
  const preferredWs  = preferredId ? workspaces.find((w) => w.id === preferredId) : undefined;
  const activeWorkspace = preferredWs ?? workspaces[0]!;

  // Fetch workspace status fields in a single query
  const { data: ws } = await db
    .from('workspaces')
    .select('onboarding_complete, is_active, subscription_status, settings')
    .eq('id', activeWorkspace.id)
    .single();

  if (ws?.onboarding_complete === false) redirect('/onboarding');
  if (ws?.is_active === false) {
    redirect(ws?.subscription_status === 'pending_approval'
      ? '/pending-approval'
      : '/payment-required');
  }

  // ── Session Gate (super_admin / admin only) ───────────────────────────────
  // max_sessions stored in workspaces.settings.max_sessions.
  // null or absent = unlimited → skip gate entirely.
  const maxSessions = (ws?.settings as Record<string, unknown> | null)?.max_sessions;
  const role        = (activeWorkspace as any).role as string | undefined;
  const isPrivileged = role === 'super_admin' || role === 'admin';

  if (isPrivileged && typeof maxSessions === 'number') {
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      const valid = await validateSession(token, activeWorkspace.id, user.id);
      if (!valid) {
        // Session was revoked or expired — tell user on a dedicated page
        redirect('/session-limit?reason=revoked');
      }
      // Valid session — let through (heartbeat handles last_seen_at update)
    } else {
      // No session cookie — try to create a new session slot
      const headerStore = await headers();
      const userAgent   = headerStore.get('user-agent') ?? 'Unknown';
      const newToken    = await createSession(
        activeWorkspace.id,
        user.id,
        userAgent,
        maxSessions,
      );
      if (!newToken) {
        // Limit already hit on another device
        redirect('/session-limit?reason=limit');
      }
      // Redirect to cookie-setter (Server Components cannot write cookies directly)
      const encodedNext = encodeURIComponent('/conversations');
      redirect(`/api/session/init?t=${newToken}&next=${encodedNext}`);
    }
  }
  // ── End Session Gate ──────────────────────────────────────────────────────

  return (
    <AppShell>
      <StoreInitializer user={initUser} workspace={activeWorkspace} />
      {children}
    </AppShell>
  );
}

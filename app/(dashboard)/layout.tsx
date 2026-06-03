import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/layout/AppShell';
import { StoreInitializer } from '@/components/StoreInitializer';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { getProfile } from '@/modules/auth/services/profile.service';
import { createAdminClient } from '@/services/supabase/admin';
import { ROUTES } from '@/lib/constants';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await getUser();
  if (!user) redirect(ROUTES.LOGIN);

  const db = createAdminClient() as any;

  // Platform admins always go to /admin — check before workspace lookup
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

  // Respect workspace cookie (set when user selects from workspace switcher)
  const cookieStore = await cookies();
  const preferredId = cookieStore.get('active_workspace_id')?.value;
  const preferredWorkspace = preferredId ? workspaces.find((w) => w.id === preferredId) : undefined;
  const activeWorkspace = preferredWorkspace ?? workspaces[0]!;

  // Guard: redirect to onboarding if workspace setup isn't complete
  const { data: ws } = await db
    .from('workspaces')
    .select('onboarding_complete')
    .eq('id', activeWorkspace.id)
    .single();

  if (ws && ws.onboarding_complete === false) {
    redirect('/onboarding');
  }

  // Check workspace is_active (subscription payment status)
  const { data: wsStatus } = await db
    .from('workspaces')
    .select('is_active, subscription_status')
    .eq('id', activeWorkspace.id)
    .single();
  if (wsStatus?.is_active === false) {
    if (wsStatus?.subscription_status === 'pending_approval') {
      redirect('/pending-approval');
    }
    redirect('/payment-required');
  }

  return (
    <AppShell>
      <StoreInitializer user={initUser} workspace={activeWorkspace} />
      {children}
    </AppShell>
  );
}

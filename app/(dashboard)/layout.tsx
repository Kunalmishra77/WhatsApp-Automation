import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { ROUTES } from '@/lib/constants';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await getUser();
  if (!user) redirect(ROUTES.LOGIN);

  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect(ROUTES.WORKSPACE_NEW);

  return <AppShell>{children}</AppShell>;
}

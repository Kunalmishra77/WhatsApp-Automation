import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Select Workspace' };

export default async function WorkspaceSelectPage() {
  const user = await getUser();
  if (!user) redirect(ROUTES.LOGIN);

  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect(ROUTES.WORKSPACE_NEW);
  if (workspaces.length === 1) redirect(ROUTES.DASHBOARD);

  return (
    <AuthCard title="Choose a workspace" subtitle="Select the workspace you want to enter">
      <div className="space-y-3">
        {workspaces.map((ws) => (
          <Link
            key={ws.id}
            href={`${ROUTES.DASHBOARD}?workspace=${ws.id}`}
            className={cn(
              'group flex cursor-pointer items-center gap-4 rounded-xl border border-border p-4',
              'transition-all duration-150 hover:border-brand-400 hover:bg-brand-50',
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-heading-md font-bold text-white">
              {ws.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-lg font-medium text-foreground">{ws.name}</p>
              <p className="text-label capitalize text-muted-foreground">
                {ws.role} · {ws.plan}
              </p>
            </div>
            <span className="text-muted-foreground transition-colors group-hover:text-brand-500">
              →
            </span>
          </Link>
        ))}

        <div className="border-t border-border pt-3 text-center">
          <Link
            href={ROUTES.WORKSPACE_NEW}
            className="text-label font-medium text-brand-600 transition-colors hover:text-brand-700"
          >
            + Create new workspace
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}

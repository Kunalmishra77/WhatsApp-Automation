import { redirect } from 'next/navigation';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { createAdminClient } from '@/services/supabase/admin';
import { OnboardingWizard } from '@/modules/onboarding/components/OnboardingWizard';

export const metadata = { title: 'Set Up Your Workspace — Agentix' };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const workspaces = await getUserWorkspaces(user.id);
  if (!workspaces.length) redirect('/workspace/new');

  const workspace = workspaces[0]!;

  const db = createAdminClient() as any;
  const { data: ws } = await db
    .from('workspaces')
    .select('onboarding_complete')
    .eq('id', workspace.id)
    .single();

  if (ws?.onboarding_complete) redirect('/conversations');

  return <OnboardingWizard workspaceId={workspace.id} workspaceName={workspace.name} />;
}

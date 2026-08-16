import { redirect } from 'next/navigation';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { OnboardingWizard } from '@/modules/onboarding/components/OnboardingWizard';

export const metadata = { title: 'Connect WhatsApp — Agentix' };

// The original guided WhatsApp-connect + import-contacts + (legacy) plan wizard.
// No longer a mandatory onboarding gate — self-serve workspaces are created
// `onboarding_complete=true` and reach the dashboard via payment, with WhatsApp
// connection surfaced as an assisted/optional step (e.g. a dashboard banner
// linking here). Kept intact and reachable, just relocated off the mandatory
// `/onboarding` path.
export default async function OnboardingWhatsAppPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const workspaces = await getUserWorkspaces(user.id);
  if (!workspaces.length) redirect('/workspace/new');

  const workspace = workspaces[0]!;

  return <OnboardingWizard workspaceId={workspace.id} workspaceName={workspace.name} />;
}

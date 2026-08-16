import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { createAdminClient } from '@/services/supabase/admin';
import { resolveOnboardingStep } from '@/lib/onboarding-state';
import { OnboardingPlanStep } from '@/modules/onboarding/components/OnboardingPlanStep';

export const metadata = { title: 'Set Up Your Workspace — Agentix' };

// Step-aware onboarding router. Resumes a self-serve signup at whichever step
// resolveOnboardingStep() says the user is on — verify email, business details,
// plan/payment, or done. Only the plan_payment step renders here directly; the
// others redirect to their dedicated pages. WhatsApp connection is a separate,
// optional step (see /onboarding/whatsapp) — it is not part of this gate.
export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const emailConfirmed = user.email_confirmed_at != null;

  const workspaces = await getUserWorkspaces(user.id);

  let workspace: { id: string; subscription_status: string; is_active: boolean } | null = null;
  if (workspaces.length > 0) {
    const cookieStore = await cookies();
    const preferredId = cookieStore.get('active_workspace_id')?.value;
    const preferred = preferredId ? workspaces.find((w) => w.id === preferredId) : undefined;
    const activeWorkspace = preferred ?? workspaces[0]!;

    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('is_active, subscription_status')
      .eq('id', activeWorkspace.id)
      .single();

    if (ws) {
      workspace = {
        id: activeWorkspace.id,
        is_active: ws.is_active as boolean,
        subscription_status: ws.subscription_status as string,
      };
    }
  }

  const step = resolveOnboardingStep({ emailConfirmed, workspace });

  if (step === 'verify_email') redirect('/verify-email');
  if (step === 'business_details') redirect('/workspace/new');
  if (step === 'done') redirect('/conversations');

  // step === 'plan_payment' — resolveOnboardingStep only returns this when
  // `workspace` is non-null, but guard explicitly rather than asserting.
  if (!workspace) redirect('/workspace/new');

  return <OnboardingPlanStep workspaceId={workspace.id} />;
}

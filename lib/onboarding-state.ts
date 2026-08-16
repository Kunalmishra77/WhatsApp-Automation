export type OnboardingStep = 'verify_email' | 'business_details' | 'plan_payment' | 'done';

export const SELF_SERVE_INITIAL = {
  is_active: false,
  subscription_status: 'incomplete',
  onboarding_complete: true,
} as const;

export function resolveOnboardingStep(input: {
  emailConfirmed: boolean;
  workspace: { subscription_status: string; is_active: boolean } | null;
}): OnboardingStep {
  if (!input.emailConfirmed) {
    return 'verify_email';
  }
  if (input.workspace === null) {
    return 'business_details';
  }
  if (input.workspace.is_active) {
    return 'done';
  }
  return 'plan_payment';
}

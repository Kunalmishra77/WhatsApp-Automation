import { describe, it, expect } from 'vitest';
import { resolveOnboardingStep, SELF_SERVE_INITIAL } from './onboarding-state';

describe('resolveOnboardingStep', () => {
  it('unverified email → verify_email', () => {
    expect(resolveOnboardingStep({ emailConfirmed: false, workspace: null })).toBe('verify_email');
  });
  it('verified, no workspace → business_details', () => {
    expect(resolveOnboardingStep({ emailConfirmed: true, workspace: null })).toBe('business_details');
  });
  it('verified, incomplete workspace → plan_payment', () => {
    expect(resolveOnboardingStep({ emailConfirmed: true, workspace: { subscription_status: 'incomplete', is_active: false } })).toBe('plan_payment');
  });
  it('active workspace → done', () => {
    expect(resolveOnboardingStep({ emailConfirmed: true, workspace: { subscription_status: 'active', is_active: true } })).toBe('done');
  });
  it('SELF_SERVE_INITIAL is the explicit inactive/incomplete state', () => {
    expect(SELF_SERVE_INITIAL).toEqual({ is_active: false, subscription_status: 'incomplete', onboarding_complete: true });
  });
});

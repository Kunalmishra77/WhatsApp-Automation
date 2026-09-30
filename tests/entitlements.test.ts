import { describe, it, expect } from 'vitest';
import { resolveEntitlements, TRIAL_CAPS, UNLIMITED } from '@/lib/entitlements';

const base = {
  isComped: false,
  isActive: true,
  status: 'active' as string | null,
  planKey: 'core' as string | null,
  hasInstagram: false,
  hasGoogleGrowth: false,
  trialEndsAt: null as string | null,
  now: new Date('2026-10-01T00:00:00Z'),
};

describe('resolveEntitlements', () => {
  it('grandfathers comped clients to all modules, no caps', () => {
    const e = resolveEntitlements({ ...base, isComped: true, planKey: 'whatsapp' });
    expect(e.accessAllowed).toBe(true);
    expect(e.modules).toEqual({ whatsapp: true, instagram: true, google_growth: true });
    expect(e.caps).toEqual(UNLIMITED);
    expect(e.trialing).toBe(false);
  });

  it('Core paid plan → WhatsApp only, add-ons locked', () => {
    const e = resolveEntitlements({ ...base, planKey: 'core' });
    expect(e.modules.whatsapp).toBe(true);
    expect(e.modules.instagram).toBe(false);
    expect(e.modules.google_growth).toBe(false);
    expect(e.caps).toEqual(UNLIMITED);
  });

  it('All-in-One → every module unlocked', () => {
    const e = resolveEntitlements({ ...base, planKey: 'all_in_one' });
    expect(e.modules).toEqual({ whatsapp: true, instagram: true, google_growth: true });
  });

  it('Core + Instagram add-on → WhatsApp + Instagram, not Google', () => {
    const e = resolveEntitlements({ ...base, planKey: 'core', hasInstagram: true });
    expect(e.modules.instagram).toBe(true);
    expect(e.modules.google_growth).toBe(false);
  });

  it('trial → Core capped, add-ons locked even if flags set', () => {
    const e = resolveEntitlements({
      ...base, status: 'trialing', planKey: 'core', hasInstagram: true, hasGoogleGrowth: true,
      trialEndsAt: '2026-10-03T00:00:00Z',
    });
    expect(e.trialing).toBe(true);
    expect(e.modules.whatsapp).toBe(true);
    expect(e.modules.instagram).toBe(false);
    expect(e.modules.google_growth).toBe(false);
    expect(e.caps).toEqual(TRIAL_CAPS);
    expect(e.trialDaysLeft).toBe(2);
  });

  it('inactive workspace → no access', () => {
    const e = resolveEntitlements({ ...base, isActive: false, status: 'suspended' });
    expect(e.accessAllowed).toBe(false);
    expect(e.modules.whatsapp).toBe(false);
  });

  it('legacy whatsapp_instagram plan → WhatsApp + Instagram', () => {
    const e = resolveEntitlements({ ...base, planKey: 'whatsapp_instagram' });
    expect(e.modules.instagram).toBe(true);
    expect(e.modules.google_growth).toBe(false);
  });
});

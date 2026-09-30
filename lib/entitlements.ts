// lib/entitlements.ts
// Single source of truth for "what can this workspace use right now" — modules
// (WhatsApp / Instagram / Google Growth), trial state, and usage caps. Every
// feature gate resolves through here so pricing/trial rules live in one place.
//
// Grandfathering: existing comped clients get everything unlocked with no caps,
// so enabling gating never removes access they already had.

export type ModuleKey = 'whatsapp' | 'instagram' | 'google_growth';

export interface EntitlementInput {
  isComped: boolean;
  isActive: boolean;          // workspaces.is_active (billing sweep keeps this current)
  status: string | null;      // subscription status: trialing | active | past_due | ...
  planKey: string | null;     // core | all_in_one | (legacy) whatsapp | whatsapp_instagram
  hasInstagram: boolean;
  hasGoogleGrowth: boolean;
  trialEndsAt: string | null; // workspaces.trial_ends_at
  now?: Date;
}

export interface Caps {
  aiRepliesPerMonth: number | null;   // null = unlimited
  campaigns: number | null;
  campaignRecipients: number | null;
}

export interface Entitlements {
  accessAllowed: boolean;
  trialing: boolean;
  trialDaysLeft: number | null;
  modules: Record<ModuleKey, boolean>;
  caps: Caps;
}

// Trial: Core capped, add-ons locked (user-confirmed 2026-09-30).
export const TRIAL_CAPS: Caps = { aiRepliesPerMonth: 100, campaigns: 1, campaignRecipients: 50 };
export const UNLIMITED: Caps = { aiRepliesPerMonth: null, campaigns: null, campaignRecipients: null };

const ALL_MODULES: Record<ModuleKey, boolean> = { whatsapp: true, instagram: true, google_growth: true };

export function resolveEntitlements(i: EntitlementInput): Entitlements {
  const now = i.now ?? new Date();

  // Comped clients (existing tenants + admin-comped) — full access, grandfathered.
  if (i.isComped) {
    return { accessAllowed: true, trialing: false, trialDaysLeft: null, modules: { ...ALL_MODULES }, caps: { ...UNLIMITED } };
  }

  const accessAllowed = i.isActive === true;
  const trialActive = i.trialEndsAt != null && Date.parse(i.trialEndsAt) > now.getTime();
  const trialing = accessAllowed && i.status === 'trialing' && trialActive;

  const planIncludesInstagram =
    i.planKey === 'all_in_one' || i.planKey === 'whatsapp_instagram' || i.hasInstagram === true;
  const planIncludesGoogle =
    i.planKey === 'all_in_one' || i.hasGoogleGrowth === true;

  const modules: Record<ModuleKey, boolean> = {
    whatsapp: accessAllowed,
    // Add-ons are locked during the trial (Core-only trial).
    instagram: accessAllowed && !trialing && planIncludesInstagram,
    google_growth: accessAllowed && !trialing && planIncludesGoogle,
  };

  const trialDaysLeft = trialActive
    ? Math.max(0, Math.ceil((Date.parse(i.trialEndsAt!) - now.getTime()) / 86_400_000))
    : null;

  return {
    accessAllowed,
    trialing,
    trialDaysLeft,
    modules,
    caps: trialing ? { ...TRIAL_CAPS } : { ...UNLIMITED },
  };
}

// DB helper: resolve a workspace's entitlements from its subscription + workspace row.
// Uses an admin client (service role). Fail-open to comped-style full access ONLY
// is never done — on error we return no-access so gating stays safe.
export async function getWorkspaceEntitlements(db: any, workspaceId: string): Promise<Entitlements> {
  const [{ data: ws }, { data: sub }] = await Promise.all([
    db.from('workspaces').select('is_active, trial_ends_at').eq('id', workspaceId).maybeSingle(),
    db.from('subscriptions').select('status, plan_key, has_instagram, has_google_growth, is_comped').eq('workspace_id', workspaceId).maybeSingle(),
  ]);

  return resolveEntitlements({
    isComped: sub?.is_comped === true,
    isActive: ws?.is_active === true,
    status: sub?.status ?? null,
    planKey: sub?.plan_key ?? null,
    hasInstagram: sub?.has_instagram === true,
    hasGoogleGrowth: sub?.has_google_growth === true,
    trialEndsAt: ws?.trial_ends_at ?? null,
  });
}

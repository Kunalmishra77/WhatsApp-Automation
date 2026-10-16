import { ROLE_PERMISSIONS, type Permission } from '@/types/auth.types';

// Pages an admin can grant/revoke for the 'agent' (employee) role, beyond the
// always-on core work surface (Dashboard, Conversations, Contacts, CRM-as-leads).
// Stored in workspaces.settings.agent_page_access as a string[] of keys below.
export const AGENT_RESTRICTABLE_PAGES = [
  { key: 'growth-copilot', label: 'Growth Copilot',    href: '/growth-copilot' },
  { key: 'crm',            label: 'CRM Pipeline',      href: '/crm' },
  { key: 'campaigns',      label: 'Campaigns',          href: '/campaigns' },
  { key: 'unified-leads',  label: 'Unified Leads',      href: '/leads' },
  { key: 'marketing-roi',  label: 'Marketing ROI',      href: '/marketing-roi' },
  { key: 'customer-segments', label: 'Customer Segments', href: '/segments' },
  { key: 'win-back',       label: 'Win-Back',           href: '/win-back' },
  { key: 'referrals',      label: 'Referrals',          href: '/referrals' },
  { key: 'meta-leads',     label: 'Meta Leads',         href: '/meta-leads' },
  { key: 'google-business', label: 'Google Business',   href: '/google-business' },
  { key: 'local-rank',     label: 'Local Rank',         href: '/local-rank' },
  { key: 'google-ads',     label: 'Google Ads',         href: '/google-ads' },
  { key: 'templates',      label: 'Templates',          href: '/templates' },
  { key: 'flows',          label: 'Flows',               href: '/flows' },
  { key: 'team',           label: 'Team',                href: '/team' },
  { key: 'analytics',      label: 'Analytics',          href: '/analytics' },
  { key: 'billing',        label: 'Billing & Meta Spend', href: '/billing' },
  { key: 'bookings',       label: 'Bookings & Events',  href: '/bookings' },
  { key: 'tasks',          label: 'Tasks',              href: '/tasks' },
  { key: 'ai-revenue',     label: 'AI Lead Intelligence', href: '/ai-revenue' },
  { key: 'knowledge-base', label: 'Knowledge Base',     href: '/knowledge-base' },
  { key: 'settings',       label: 'Settings',           href: '/settings' },
] as const;

export type AgentPageKey = typeof AGENT_RESTRICTABLE_PAGES[number]['key'];

export const ALL_AGENT_PAGE_KEYS: AgentPageKey[] = AGENT_RESTRICTABLE_PAGES.map((p) => p.key);

// Nothing extra granted by default — admin opts agents into pages explicitly.
export const DEFAULT_AGENT_ALLOWED_PAGES: AgentPageKey[] = [];

// What granting a page to the 'agent' role actually permits at the API layer.
//
// Without this the Team page's per-page toggles were cosmetic: the page opened but
// every request behind it 403'd, because an agent's permissions came only from the
// static ROLE_PERMISSIONS matrix. lib/authz.ts now unions an agent's static
// permissions with the entries below for each page their admin granted, so a grant
// works end to end.
//
// Deliberately narrow: only 'settings' implies 'manage_workspace'. Surfaces whose
// APIs used to sit behind that blanket permission (Knowledge Base, Local Rank,
// Google Business) have their own page-scoped permission instead, so granting one
// surface never unlocks workspace settings, API keys or integrations.
export const AGENT_PAGE_PERMISSIONS: Record<AgentPageKey, Permission[]> = {
  'growth-copilot':    ['view_analytics'],
  'crm':               ['view_analytics'],
  'campaigns':         ['create_campaigns', 'view_analytics'],
  'unified-leads':     ['view_analytics'],
  'marketing-roi':     ['view_analytics'],
  'customer-segments': ['view_analytics'],
  'win-back':          ['view_analytics'],
  'referrals':         ['view_analytics'],
  'meta-leads':        ['view_analytics'],
  'google-business':   ['view_analytics', 'manage_gbp'],
  'local-rank':        ['view_analytics', 'manage_local_rank'],
  'google-ads':        ['view_analytics'],
  'templates':         ['manage_templates'],
  'flows':             ['manage_templates'],
  'team':              ['manage_team'],
  'analytics':         ['view_analytics'],
  'billing':           ['billing_management', 'view_analytics'],
  'bookings':          ['view_analytics'],
  'tasks':             ['view_analytics'],
  'ai-revenue':        ['view_analytics'],
  'knowledge-base':    ['manage_knowledge_base'],
  'settings':          ['manage_workspace'],
};

// Every permission an agent holds: their role's static set, plus whatever the pages
// their admin granted imply. `granted` is workspaces.settings.agent_page_access.
export function agentEffectivePermissions(granted: readonly string[]): Permission[] {
  const out = new Set<Permission>(ROLE_PERMISSIONS.agent);
  for (const key of granted) {
    const perms = AGENT_PAGE_PERMISSIONS[key as AgentPageKey];
    if (perms) for (const p of perms) out.add(p);
  }
  return [...out];
}

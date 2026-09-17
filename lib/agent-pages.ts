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
  { key: 'meta-leads',     label: 'Meta Leads',         href: '/meta-leads' },
  { key: 'google-business', label: 'Google Business',   href: '/google-business' },
  { key: 'google-ads',     label: 'Google Ads',         href: '/google-ads' },
  { key: 'templates',      label: 'Templates',          href: '/templates' },
  { key: 'flows',          label: 'Flows',               href: '/flows' },
  { key: 'team',           label: 'Team',                href: '/team' },
  { key: 'analytics',      label: 'Analytics',          href: '/analytics' },
  { key: 'billing',        label: 'Billing & Meta Spend', href: '/billing' },
  { key: 'bookings',       label: 'Bookings & Events',  href: '/bookings' },
  { key: 'tasks',          label: 'Tasks',              href: '/tasks' },
  { key: 'ai-revenue',     label: 'AI Revenue',         href: '/ai-revenue' },
  { key: 'knowledge-base', label: 'Knowledge Base',     href: '/knowledge-base' },
  { key: 'settings',       label: 'Settings',           href: '/settings' },
] as const;

export type AgentPageKey = typeof AGENT_RESTRICTABLE_PAGES[number]['key'];

export const ALL_AGENT_PAGE_KEYS: AgentPageKey[] = AGENT_RESTRICTABLE_PAGES.map((p) => p.key);

// Nothing extra granted by default — admin opts agents into pages explicitly.
export const DEFAULT_AGENT_ALLOWED_PAGES: AgentPageKey[] = [];

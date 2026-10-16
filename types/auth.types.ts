export type UserRole = 'super_admin' | 'admin' | 'manager' | 'agent';

export type Permission =
  | 'manage_workspace'
  | 'manage_team'
  | 'create_campaigns'
  | 'view_analytics'
  | 'manage_templates'
  | 'handle_conversations'
  | 'manage_contacts'
  | 'manage_leads'
  | 'view_all_conversations'
  | 'billing_management'
  // Narrow, page-scoped permissions. These exist so an admin can grant an employee a
  // single surface (Knowledge Base, Local Rank, Google Business) without handing them
  // 'manage_workspace', which also unlocks settings, API keys and integrations.
  | 'manage_knowledge_base'
  | 'manage_local_rank'
  | 'manage_gbp';

export interface JWTClaims {
  sub: string;
  email: string;
  workspace_id: string;
  role: UserRole;
  permissions: Permission[];
  workspace_slug: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
    'manage_templates', 'handle_conversations', 'manage_contacts', 'manage_leads',
    'view_all_conversations', 'billing_management',
    'manage_knowledge_base', 'manage_local_rank', 'manage_gbp',
  ],
  admin: [
    'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
    'manage_templates', 'handle_conversations', 'manage_contacts', 'manage_leads',
    'view_all_conversations', 'billing_management',
    'manage_knowledge_base', 'manage_local_rank', 'manage_gbp',
  ],
  manager: [
    'manage_team', 'create_campaigns', 'view_analytics', 'manage_templates',
    'handle_conversations', 'manage_contacts', 'manage_leads', 'view_all_conversations',
    'manage_knowledge_base', 'manage_local_rank', 'manage_gbp',
  ],
  agent: [
    'handle_conversations', 'manage_contacts', 'manage_leads',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Every permission key, for validating admin-authored custom roles and for
// rendering the permission picker on the Team page.
export const ALL_PERMISSIONS: Permission[] = [
  'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
  'manage_templates', 'handle_conversations', 'manage_contacts', 'manage_leads',
  'view_all_conversations', 'billing_management',
  'manage_knowledge_base', 'manage_local_rank', 'manage_gbp',
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_workspace:       'Workspace settings, API keys and integrations',
  manage_team:            'Invite, edit and remove team members',
  create_campaigns:       'Create and send campaigns',
  view_analytics:         'View analytics, reports and dashboards',
  manage_templates:       'Create and submit WhatsApp templates and flows',
  handle_conversations:   'Reply in the inbox',
  manage_contacts:        'Add and edit contacts',
  manage_leads:           'Work the CRM pipeline',
  view_all_conversations: 'See every conversation, not only assigned ones',
  billing_management:     'Subscription, invoices and payments',
  manage_knowledge_base:  'Edit the AI knowledge base',
  manage_local_rank:      'Run and configure local rank tracking',
  manage_gbp:             'Post and reply on Google Business Profile',
};

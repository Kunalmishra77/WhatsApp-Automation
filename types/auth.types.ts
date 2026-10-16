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

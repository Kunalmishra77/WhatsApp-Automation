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
  | 'billing_management';

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
  ],
  admin: [
    'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
    'manage_templates', 'handle_conversations', 'manage_contacts', 'manage_leads',
    'view_all_conversations', 'billing_management',
  ],
  manager: [
    'manage_team', 'create_campaigns', 'view_analytics', 'manage_templates',
    'handle_conversations', 'manage_contacts', 'manage_leads', 'view_all_conversations',
  ],
  agent: [
    'handle_conversations', 'manage_contacts', 'manage_leads',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

import { cookies } from 'next/headers';
import { createAdminClient } from '@/services/supabase/admin';

/**
 * Resolve which workspace a request is "in" for routes that don't take a
 * workspaceId param, mirroring how DashboardLayout picks the active workspace.
 *
 * Routes used to do `.from('workspace_members').select(...).eq('user_id', id).single()`,
 * which throws the moment a user belongs to more than one workspace — exactly the
 * case for anyone invited onto a second team — and ignored the workspace they
 * actually had open.
 *
 * Returns null when the user has no workspace at all.
 */
export async function resolveActiveWorkspaceId(userId: string): Promise<string | null> {
  const db = createAdminClient() as any;
  const { data: rows } = await db
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId);

  const ids: string[] = (rows ?? []).map((r: { workspace_id: string }) => r.workspace_id);
  if (ids.length === 0) return null;

  const preferred = (await cookies()).get('active_workspace_id')?.value;
  return preferred && ids.includes(preferred) ? preferred : ids[0]!;
}

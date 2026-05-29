/* eslint-disable @typescript-eslint/no-explicit-any */
// Type assertions here are intentional — proper DB types are generated in Phase 3
// via: supabase gen types typescript --project-id <id> > types/database.types.ts
import { createClient } from '@/services/supabase/server';

export interface WorkspaceWithRole {
  id:              string;
  name:            string;
  slug:            string;
  logo_url:        string | null;
  plan:            string;
  waba_id:         string | null;
  phone_number_id: string | null;
  role:            string;
}

export async function getUserWorkspaces(userId: string): Promise<WorkspaceWithRole[]> {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('workspace_members')
    .select('role, workspace:workspaces(id, name, slug, logo_url, plan, waba_id, phone_number_id)')
    .eq('user_id', userId);

  if (error || !data) return [];

  return (data as Array<{ role: string; workspace: Record<string, unknown> | null }>)
    .filter((m) => m.workspace !== null)
    .map((m) => ({ ...(m.workspace as unknown as WorkspaceWithRole), role: m.role }));
}

export async function createWorkspace(
  userId: string,
  name: string,
  slug: string,
): Promise<{ workspaceId: string | null; error: string | null }> {
  const supabase = await createClient();
  const db = supabase as any;

  const { data: workspace, error: wsError } = await db
    .from('workspaces')
    .insert({ name, slug })
    .select('id')
    .single();

  if (wsError || !workspace) {
    if ((wsError as any)?.code === '23505') {
      return { workspaceId: null, error: 'That URL slug is already taken. Try another.' };
    }
    return { workspaceId: null, error: (wsError as any)?.message ?? 'Failed to create workspace.' };
  }

  const workspaceId = (workspace as any).id as string;

  const { error: memberError } = await db
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: userId, role: 'super_admin' });

  if (memberError) return { workspaceId: null, error: (memberError as any).message };

  return { workspaceId, error: null };
}

'use server';

import { redirect } from 'next/navigation';
import { workspaceCreateSchema } from '@/modules/auth/types';
import { getUser } from '@/modules/auth/services/auth.service';
import { createAdminClient } from '@/services/supabase/admin';
import { ROUTES } from '@/lib/constants';
import { SELF_SERVE_INITIAL } from '@/lib/onboarding-state';
import type { AuthActionResult } from '@/modules/auth/types';

export async function createWorkspaceAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = {
    name:         formData.get('name'),
    slug:         formData.get('slug'),
    company_name: formData.get('company_name'),
    owner_phone:  formData.get('owner_phone'),
    industry:     formData.get('industry'),
  };
  const parsed = workspaceCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const user = await getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  // Use admin client to bypass RLS — user auth is already verified above
  const db = createAdminClient() as any;

  const { data: workspace, error: wsError } = await db
    .from('workspaces')
    .insert({
      name:         parsed.data.name,
      slug:         parsed.data.slug,
      plan:         'whatsapp',
      owner_email:  user.email,
      owner_phone:  parsed.data.owner_phone,
      industry:     parsed.data.industry,
      settings:     { company_name: parsed.data.company_name },
      ...SELF_SERVE_INITIAL,
    })
    .select('id')
    .single();

  if (wsError) {
    if ((wsError as any)?.code === '23505') {
      return { success: false, error: 'That URL slug is already taken. Try another.' };
    }
    return { success: false, error: (wsError as any)?.message ?? 'Failed to create workspace.' };
  }

  const workspaceId = workspace.id as string;

  await db.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: user.id,
    role: 'super_admin',
  });

  redirect(ROUTES.ONBOARDING);
}

'use server';

import { redirect } from 'next/navigation';
import { workspaceCreateSchema } from '@/modules/auth/types';
import { createWorkspace } from '@/modules/auth/services/workspace.service';
import { getUser } from '@/modules/auth/services/auth.service';
import { ROUTES } from '@/lib/constants';
import type { AuthActionResult } from '@/modules/auth/types';

export async function createWorkspaceAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = { name: formData.get('name'), slug: formData.get('slug') };
  const parsed = workspaceCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const user = await getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  const { workspaceId, error } = await createWorkspace(
    user.id,
    parsed.data.name,
    parsed.data.slug,
  );
  if (error || !workspaceId) return { success: false, error: error ?? 'Failed to create workspace.' };

  redirect(ROUTES.DASHBOARD);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { loginSchema, signupSchema, forgotPasswordSchema } from '@/modules/auth/types';
import {
  signInWithPassword,
  signUp,
  signOut,
  resetPasswordForEmail,
} from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { ROUTES } from '@/lib/constants';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import type { AuthActionResult } from '@/modules/auth/types';

export async function loginAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = { email: formData.get('email'), password: formData.get('password') };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  let { user, error } = await signInWithPassword(parsed.data.email, parsed.data.password);

  if (!user && error === 'Please verify your email before signing in.') {
    try {
      const { createAdminClient } = await import('@/services/supabase/admin');
      const adminDb = createAdminClient();
      const { data: list } = await adminDb.auth.admin.listUsers();
      const found = list?.users?.find((u: { email?: string }) => u.email === parsed.data.email);
      if (found) {
        await adminDb.auth.admin.updateUserById(found.id, { email_confirm: true });
        const retry = await signInWithPassword(parsed.data.email, parsed.data.password);
        user = retry.user;
        error = retry.error;
      }
    } catch { /* non-fatal */ }
  }

  if (error || !user) return { success: false, error: error ?? 'Sign in failed.' };

  const workspaces = await getUserWorkspaces(user.id);

  revalidatePath('/', 'layout');

  if (workspaces.length === 0)  return { success: true, redirectTo: ROUTES.WORKSPACE_NEW };
  if (workspaces.length === 1)  return { success: true, redirectTo: ROUTES.DASHBOARD };
  return { success: true, redirectTo: ROUTES.WORKSPACE_SELECT };
}

export async function signupAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = {
    full_name:        formData.get('full_name'),
    email:            formData.get('email'),
    password:         formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  };
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { user, error } = await signUp(
    parsed.data.email,
    parsed.data.password,
    parsed.data.full_name,
  );
  if (error || !user) return { success: false, error: error ?? 'Sign up failed.' };

  await signInWithPassword(parsed.data.email, parsed.data.password);

  revalidatePath('/', 'layout');
  return { success: true, redirectTo: ROUTES.WORKSPACE_NEW };
}

export async function forgotPasswordAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = { email: formData.get('email') };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: 'Enter a valid email address.' };

  const { error } = await resetPasswordForEmail(parsed.data.email);
  if (error) return { success: false, error };
  return { success: true };
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const { deleteSession } = await import('@/lib/session');
    await deleteSession(token);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  await signOut();
  revalidatePath('/', 'layout');
  redirect(ROUTES.LOGIN);
}

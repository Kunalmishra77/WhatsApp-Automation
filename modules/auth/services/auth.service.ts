import { createClient } from '@/services/supabase/server';
import { friendlySupabaseError, APP_URL } from '@/lib/constants';

export async function signInWithPassword(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: friendlySupabaseError(error.message) };
  return { user: data.user, error: null };
}

export async function signUp(email: string, password: string, fullName: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${APP_URL}/api/auth/callback`,
    },
  });
  if (error) return { user: null, error: friendlySupabaseError(error.message) };
  return { user: data.user, error: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_URL}/api/auth/callback?next=/reset-password`,
  });
  if (error) return { error: friendlySupabaseError(error.message) };
  return { error: null };
}

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

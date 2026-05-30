import { createClient } from '@/services/supabase/server';

interface Profile {
  full_name: string;
  avatar_url: string | null;
  email: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('full_name, avatar_url, email')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

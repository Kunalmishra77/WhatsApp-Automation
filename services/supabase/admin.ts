import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceEnv } from '@/lib/supabase-env';
import type { Database } from '@/types/database.types';

export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

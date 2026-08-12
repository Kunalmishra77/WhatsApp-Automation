// lib/require-platform-admin.ts — shared platform-admin gate.
// Centralizes the `profiles.is_platform_admin` check duplicated as `checkAdmin()`
// across app/api/admin/* routes (e.g. app/api/admin/meta-billing/route.ts). New
// super-admin-only routes should call this instead of re-implementing the check.
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { AuthzError } from '@/lib/authz';

export interface PlatformAdminContext {
  userId: string;
}

// Resolves the authenticated user, then verifies profiles.is_platform_admin via the
// admin client (RLS on `profiles` would otherwise block reading another/self row in
// some policies — the admin client mirrors the existing checkAdmin() pattern).
// Throws AuthzError(401) if unauthenticated, AuthzError(403) if not a platform admin.
// Callers should catch AuthzError and respond with `authzResponse(error)` from lib/authz.
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AuthzError('Authentication required', 401);
  }

  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) {
    throw new AuthzError('Forbidden', 403);
  }

  return { userId: user.id };
}

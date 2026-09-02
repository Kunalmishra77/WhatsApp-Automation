import { type NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { getSupabaseEnv } from '@/lib/supabase-env';

export const runtime = 'nodejs';

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChangePasswordBody;
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current and new password are required' },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 },
      );
    }

    // Identify the current user from their session cookie — same pattern
    // requireWorkspacePermission uses in lib/authz.ts.
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify the current password via a throwaway anon client so this sign-in
    // attempt never touches the request's real session cookies.
    const { url, anonKey } = getSupabaseEnv();
    const verifyClient = createSupabaseClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    // Update the password with the service-role client (bypasses the need
    // for a fresh recovery session — the current-password check above already
    // proved ownership).
    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error('[ChangePassword] updateUserById failed', updateError.message);
      return NextResponse.json({ error: 'Could not update password' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ChangePassword]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

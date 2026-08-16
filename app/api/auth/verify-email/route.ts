import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { verifyOtp } from '@/lib/email-otp';

export const runtime = 'nodejs';

const REASON_MESSAGES: Record<string, string> = {
  not_found: 'No verification code found. Please request a new one.',
  too_many:  'Too many incorrect attempts. Please request a new code.',
  expired:   'This code has expired. Please request a new one.',
  mismatch:  'Incorrect code. Please try again.',
};

// POST /api/auth/verify-email
// Body: { code, email? }
// Confirms the user's email once the 6-digit OTP matches. Works with an
// authenticated session (normal case) OR, when there's no session (e.g. the
// user abandoned signup/login before it landed), by resolving the target
// user from the submitted `email` — but only if that account is still
// unconfirmed. Ownership is proven by the OTP itself, not by having a
// session, so this is safe: a confirmed account can never be re-targeted
// this way, and a wrong/expired/mismatched code is rejected exactly as
// before.
export async function POST(request: NextRequest) {
  try {
    const { code, email: bodyEmail } = await request.json() as { code?: string; email?: string };
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user: sessionUser } } = await supabase.auth.getUser();

    const db = createAdminClient() as any;

    let userId: string;
    if (sessionUser) {
      userId = sessionUser.id;
    } else {
      if (!bodyEmail) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      const { data: list } = await db.auth.admin.listUsers();
      const found = list?.users?.find(
        (u: { email?: string; email_confirmed_at?: string | null }) => u.email === bodyEmail,
      );
      if (!found || found.email_confirmed_at) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      userId = found.id;
    }

    const result = await verifyOtp(db, userId, code);
    if (!result.ok) {
      return NextResponse.json(
        { error: REASON_MESSAGES[result.reason ?? 'mismatch'], reason: result.reason },
        { status: 400 },
      );
    }

    await db.auth.admin.updateUserById(userId, { email_confirm: true });
    await db.from('email_otps').delete().eq('user_id', userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[VerifyEmail]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

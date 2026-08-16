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
// Body: { code }
// Confirms the current user's email once the 6-digit OTP matches.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { code } = await request.json() as { code?: string };
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

    const db = createAdminClient() as any;

    const result = await verifyOtp(db, user.id, code);
    if (!result.ok) {
      return NextResponse.json(
        { error: REASON_MESSAGES[result.reason ?? 'mismatch'], reason: result.reason },
        { status: 400 },
      );
    }

    await db.auth.admin.updateUserById(user.id, { email_confirm: true });
    await db.from('email_otps').delete().eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[VerifyEmail]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { issueOtp, buildOtpEmail } from '@/lib/email-otp';
import { sendMail } from '@/lib/mailer';

export const runtime = 'nodejs';

const RESEND_COOLDOWN_MS = 60 * 1000;

// POST /api/auth/resend-otp
// Body: { email? }
// Issues (or re-issues) a 6-digit email verification code and emails it.
// Rate-limited to one send per 60s per user. Works with an authenticated
// session (normal case) OR, when there's no session, by resolving the
// target user from the submitted `email` — only if that account is still
// unconfirmed (see verify-email/route.ts for why this is safe).
export async function POST(request: NextRequest) {
  try {
    const { email: bodyEmail } = await request.json().catch(() => ({})) as { email?: string };

    const supabase = await createClient();
    const { data: { user: sessionUser } } = await supabase.auth.getUser();

    const db = createAdminClient() as any;

    let userId: string;
    let targetEmail: string;

    if (sessionUser) {
      if (!sessionUser.email) return NextResponse.json({ error: 'Account has no email on file' }, { status: 400 });
      userId = sessionUser.id;
      targetEmail = sessionUser.email;
    } else {
      if (!bodyEmail) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('email', bodyEmail)
        .maybeSingle();
      if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      const { data: found } = await db.auth.admin.getUserById(profile.id);
      if (!found?.user || found.user.email_confirmed_at) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      userId = found.user.id;
      targetEmail = bodyEmail;
    }

    const { data: existing } = await db
      .from('email_otps')
      .select('created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return NextResponse.json(
        { error: 'Please wait a minute before requesting another code.' },
        { status: 429 },
      );
    }

    const code = await issueOtp(db, userId);

    const { ok, error } = await sendMail({
      to: targetEmail,
      ...buildOtpEmail(code),
    });

    if (!ok) {
      console.error('[ResendOtp] sendMail failed', error);
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ResendOtp]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

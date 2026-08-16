import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { issueOtp } from '@/lib/email-otp';
import { sendMail } from '@/lib/mailer';

export const runtime = 'nodejs';

const RESEND_COOLDOWN_MS = 60 * 1000;

// POST /api/auth/resend-otp
// Issues (or re-issues) a 6-digit email verification code for the current
// user and emails it. Rate-limited to one send per 60s per user.
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!user.email) return NextResponse.json({ error: 'Account has no email on file' }, { status: 400 });

    const db = createAdminClient() as any;

    const { data: existing } = await db
      .from('email_otps')
      .select('created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return NextResponse.json(
        { error: 'Please wait a minute before requesting another code.' },
        { status: 429 },
      );
    }

    const code = await issueOtp(db, user.id);

    const { ok, error } = await sendMail({
      to: user.email,
      subject: 'Your Agentix verification code',
      html: `<p>Your Agentix verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 10 minutes.</p>`,
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

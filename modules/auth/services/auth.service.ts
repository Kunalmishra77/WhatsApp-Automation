import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { sendMail } from '@/lib/mailer';
import { friendlySupabaseError, APP_URL } from '@/lib/constants';

export async function signInWithPassword(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: friendlySupabaseError(error.message) };
  return { user: data.user, error: null };
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  opts?: { confirmed?: boolean },
) {
  // Public self-service signup creates an UNconfirmed user by default — the
  // caller (signupAction) issues an email OTP and gates access until verified.
  // Callers that must stay pre-confirmed (e.g. team invite accept, which
  // never verifies) pass { confirmed: true } to skip that friction.
  const { createAdminClient } = await import('@/services/supabase/admin');
  const adminDb = createAdminClient();
  const { data: adminData, error: adminError } = await adminDb.auth.admin.createUser({
    email,
    password,
    email_confirm: opts?.confirmed ?? false,
    user_metadata: { full_name: fullName },
  });
  if (adminError) return { user: null, error: friendlySupabaseError(adminError.message) };
  return { user: adminData.user, error: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string) {
  // Deliver the reset link via Resend (our working mailer) instead of Supabase's
  // built-in SMTP, which is not configured on this project ("Error sending recovery
  // email"). The admin API generates the one-time recovery token WITHOUT sending an
  // email; we build the same URL the reset-password page expects
  // (`/reset-password?token_hash=…&type=recovery`) and mail it ourselves. The token is
  // only redeemed when the user submits the form (see app/(auth)/reset-password/page.tsx).
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${APP_URL}/reset-password` },
  });

  // Never reveal whether an email is registered: treat "user not found" as success
  // (no mail sent). Only surface a real send failure to the caller.
  if (error) {
    if (/not found|no user|user.*does/i.test(error.message)) return { error: null };
    return { error: friendlySupabaseError(error.message) };
  }

  const tokenHash = (data as { properties?: { hashed_token?: string } })?.properties?.hashed_token;
  if (!tokenHash) return { error: null };

  const resetUrl = `${APP_URL}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  const sent = await sendMail({
    to: email,
    subject: 'Reset your AGENTiX password',
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">Reset your password</h2>
      <p style="color:#555;margin:0 0 20px">We received a request to reset your AGENTiX password. Click the button below to choose a new one. This link can be used once and expires shortly.</p>
      <p style="margin:0 0 24px"><a href="${resetUrl}" style="background:#e8622a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">Reset password</a></p>
      <p style="color:#888;font-size:13px;margin:0 0 6px">Or paste this link into your browser:</p>
      <p style="color:#888;font-size:13px;word-break:break-all;margin:0 0 20px">${resetUrl}</p>
      <p style="color:#aaa;font-size:12px;margin:0">If you didn't request this, you can safely ignore this email.</p>
    </div>`,
  });
  if (!sent.ok) return { error: 'Could not send the reset email. Please try again in a moment.' };
  return { error: null };
}

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

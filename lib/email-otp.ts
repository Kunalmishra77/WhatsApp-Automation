import crypto from 'node:crypto';

// Self-service onboarding email verification. Codes are single-use (a new
// code deletes any prior row for the user) and short-lived (10 min TTL),
// with a per-code attempt cap enforced in verifyOtp.

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// db: admin Supabase client (RLS on email_otps is deny-all).
export async function issueOtp(db: any, userId: string): Promise<string> {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await db.from('email_otps').delete().eq('user_id', userId);

  await db.from('email_otps').insert({
    user_id: userId,
    code_hash: hashOtp(code),
    expires_at: expiresAt,
    attempts: 0,
  });

  return code;
}

export type VerifyOtpFailureReason = 'expired' | 'mismatch' | 'too_many' | 'not_found';

export interface VerifyOtpResult {
  ok: boolean;
  reason?: VerifyOtpFailureReason;
}

export async function verifyOtp(db: any, userId: string, code: string): Promise<VerifyOtpResult> {
  const { data: row } = await db
    .from('email_otps')
    .select('id, code_hash, expires_at, attempts')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many' };
  if (new Date(row.expires_at) < new Date()) return { ok: false, reason: 'expired' };

  if (hashOtp(code) !== row.code_hash) {
    await db.from('email_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true };
}

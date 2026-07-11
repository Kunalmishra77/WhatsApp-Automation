'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

/**
 * Supabase reports auth-link failures in the URL — the OTP/verify endpoint
 * appends them to the fragment (`#error=access_denied&error_code=otp_expired`)
 * and our callback route adds `?error=...`. Neither is visible to the user on
 * its own. This reads both, shows a plain-language notice, and strips the noise
 * from the address bar.
 */
export function AuthErrorNotice() {
  const [message, setMessage] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);

    const errorCode = hash.get('error_code') ?? query.get('error_code');
    const errorFlag = hash.get('error') ?? query.get('error');
    if (!errorCode && !errorFlag) return;

    const isExpired =
      errorCode === 'otp_expired' ||
      errorFlag === 'auth_failed' ||
      errorFlag === 'verification_failed' ||
      errorFlag === 'access_denied';

    setExpired(isExpired);
    setMessage(
      isExpired
        ? 'That link is invalid or has expired. Request a new one and open it right away.'
        : hash.get('error_description')?.replace(/\+/g, ' ') ??
            'Something went wrong. Please try again.',
    );

    // Clean the error out of the URL so a refresh/bookmark is not stuck on it.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  if (!message) return null;

  return (
    <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-label text-destructive">
      <p>{message}</p>
      {expired && (
        <Link
          href={ROUTES.FORGOT_PASSWORD}
          className="mt-1 inline-block font-medium underline underline-offset-2"
        >
          Request a new reset link
        </Link>
      )}
    </div>
  );
}

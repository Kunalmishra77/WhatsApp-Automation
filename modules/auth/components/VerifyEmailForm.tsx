'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const RESEND_COOLDOWN_SECONDS = 60;

interface Props {
  email: string | null;
  notice?: string;
  hasSession: boolean;
}

export function VerifyEmailForm({ email, notice, hasSession }: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (notice === 'unverified') {
      toast.info("Please verify your email — we've sent you a new code.");
    }
    // Only show this once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `email` lets the endpoint resolve an unconfirmed user when there's
        // no session yet (e.g. arriving here straight from signup/login); an
        // authenticated request ignores it and uses the session instead.
        body: JSON.stringify({ code, email }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Verification failed. Please try again.');
        return;
      }

      toast.success('Email verified!');
      // A session-less verify (the common self-service signup path) leaves
      // the user logged out — /onboarding would just bounce them through
      // /login. Send them to log in explicitly instead. If they already had
      // a session (e.g. the logged-in-resend case), go straight to onboarding.
      router.push(hasSession ? '/onboarding' : '/login?verified=1');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    setError(null);
    setIsResending(true);
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to resend code.');
        return;
      }

      toast.success('A new code is on its way.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl">
        📬
      </div>

      <div className="space-y-2 text-center">
        <p className="text-body-md text-muted-foreground">
          We sent a 6-digit verification code to{' '}
          {email ? (
            <span className="font-medium text-foreground">{email}</span>
          ) : (
            'your email address'
          )}
          .
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
            className="h-11 text-center text-lg tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-label text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="h-11 w-full bg-brand-500 font-medium text-white hover:bg-brand-600"
          disabled={isVerifying}
        >
          {isVerifying ? 'Verifying…' : 'Verify email'}
        </Button>
      </form>

      <div className="border-t border-border pt-4 text-center">
        <p className="mb-2 text-label text-muted-foreground">Didn't get a code?</p>
        <Button
          type="button"
          variant="ghost"
          onClick={handleResend}
          disabled={isResending || cooldown > 0}
          className="h-9 font-medium text-brand-600 hover:text-brand-700"
        >
          {cooldown > 0
            ? `Resend code in ${cooldown}s`
            : isResending
              ? 'Sending…'
              : 'Resend code'}
        </Button>
      </div>
    </div>
  );
}

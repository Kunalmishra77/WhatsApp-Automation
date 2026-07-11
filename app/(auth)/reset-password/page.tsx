'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/services/supabase/client';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Recovery token delivered via the email template as
  // `/reset-password?token_hash={{ .TokenHash }}&type=recovery`.
  // Verification runs ONLY on submit (below) — never on page load — so email
  // link scanners (Gmail, security gateways) that GET the URL cannot consume
  // the one-time token before the user acts on it.
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();

      // If the link carried a token_hash, redeem it now to open a recovery
      // session. If it did not, we assume a recovery session already exists
      // (legacy code-exchange flow via /api/auth/callback).
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as 'recovery') ?? 'recovery',
        });
        if (error) {
          setExpired(true);
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);

      // Clear the short-lived recovery session so the user signs in fresh.
      await supabase.auth.signOut();
      toast.success('Password updated! Please sign in.');
      router.push(ROUTES.LOGIN);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (expired) {
    return (
      <AuthCard
        title="Link expired"
        subtitle="This password reset link is invalid or has already been used."
      >
        <div className="space-y-4">
          <p className="text-body-md text-muted-foreground">
            Reset links can only be used once and expire quickly. Request a fresh
            one and open it straight away.
          </p>
          <Button
            asChild
            className="h-11 w-full bg-brand-500 font-medium text-white hover:bg-brand-600"
          >
            <Link href={ROUTES.FORGOT_PASSWORD}>Request a new link</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set new password" subtitle="Enter your new password below">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="password">New Password</Label>
          <PasswordInput
            id="password"
            placeholder="Min 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm Password</Label>
          <PasswordInput
            id="confirm"
            placeholder="Repeat new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="h-11"
          />
        </div>
        <Button
          type="submit"
          className="h-11 w-full bg-brand-500 font-medium text-white hover:bg-brand-600"
          disabled={loading}
        >
          {loading ? 'Updating…' : 'Update Password'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

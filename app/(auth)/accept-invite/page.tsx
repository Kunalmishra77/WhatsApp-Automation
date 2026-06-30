'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

interface InviteInfo {
  email: string;
  role: string;
  roleLabel: string;
  workspaceName: string;
  accountExists: boolean;
}

// useSearchParams() requires a Suspense boundary for static prerendering —
// the actual page content is the inner component, this just wraps it.
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <AuthCard title="Loading invite…">
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AuthCard>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const token = useSearchParams().get('token');

  const [loading, setLoading]   = useState(true);
  const [invite, setInvite]     = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');

  useEffect(() => {
    if (!token) {
      setLoadError('Missing invite token.');
      setLoading(false);
      return;
    }
    fetch(`/api/team/invite/accept?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json() as InviteInfo & { error?: string };
        if (!r.ok) throw new Error(data.error ?? 'Invalid invite');
        setInvite(data);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invite) return;

    if (!invite.accountExists) {
      if (fullName.trim().length < 2) { toast.error('Enter your full name'); return; }
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        toast.error('Password must be 8+ characters with 1 uppercase letter and 1 number');
        return;
      }
      if (password !== confirm) { toast.error("Passwords don't match"); return; }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/team/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fullName, password }),
      });
      const data = await res.json() as { success?: boolean; error?: string; message?: string };

      if (!res.ok) {
        if (data.error === 'ALREADY_HAS_ACCOUNT') {
          toast.error(data.message ?? 'Please log in first, then open this invite link again.');
          router.push(`/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`);
          return;
        }
        throw new Error(data.error ?? 'Failed to accept invite');
      }

      toast.success(`Welcome to ${invite.workspaceName}!`);
      router.push('/conversations');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthCard title="Loading invite…">
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AuthCard>
    );
  }

  if (loadError || !invite) {
    return (
      <AuthCard title="Invite not valid" subtitle={loadError ?? 'This invite link could not be found.'}>
        <p className="text-sm text-muted-foreground">
          Ask whoever invited you to send a new invitation.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          Go to login →
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${invite.workspaceName}`}
      subtitle={`You've been invited as ${invite.roleLabel} (${invite.email})`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {invite.accountExists ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            An account with this email already exists. If you're logged in as <strong>{invite.email}</strong>, click below to join. Otherwise, log in first then reopen this link.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Johnson"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Set a password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                className="h-11"
              />
            </div>
          </>
        )}

        <Button
          type="submit"
          className="h-11 w-full bg-brand-500 font-medium text-white hover:bg-brand-600"
          disabled={submitting}
        >
          {submitting ? 'Joining…' : invite.accountExists ? 'Join workspace' : 'Create account & join'}
        </Button>
      </form>
    </AuthCard>
  );
}

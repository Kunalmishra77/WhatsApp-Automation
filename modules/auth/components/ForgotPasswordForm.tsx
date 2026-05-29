'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPasswordAction } from '@/app/actions/auth.actions';
import type { AuthActionResult } from '@/modules/auth/types';

const initialState: AuthActionResult = { success: false };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  useEffect(() => {
    if (!state.success && state.error) toast.error(state.error);
  }, [state]);

  if (state.success) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl">
          ✉️
        </div>
        <div className="space-y-1">
          <p className="text-body-md font-medium text-foreground">Check your inbox</p>
          <p className="text-body-md text-muted-foreground">
            We sent a password reset link. Check spam if you don't see it.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block text-body-md font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          className="h-11"
        />
      </div>

      {!state.success && state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-label text-destructive">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        className="h-11 w-full bg-brand-500 font-medium text-white hover:bg-brand-600"
        disabled={isPending}
      >
        {isPending ? 'Sending link…' : 'Send reset link'}
      </Button>

      <p className="text-center">
        <Link
          href="/login"
          className="text-label text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}

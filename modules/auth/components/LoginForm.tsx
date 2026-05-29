'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/app/actions/auth.actions';
import type { AuthActionResult } from '@/modules/auth/types';

const initialState: AuthActionResult = { success: false };

export function LoginForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.success && state.redirectTo) {
      router.push(state.redirectTo);
    }
    if (!state.success && state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-label text-brand-600 hover:text-brand-700 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
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
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-body-md text-muted-foreground">
        No account?{' '}
        <Link
          href="/signup"
          className="font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          Create one free
        </Link>
      </p>
    </form>
  );
}

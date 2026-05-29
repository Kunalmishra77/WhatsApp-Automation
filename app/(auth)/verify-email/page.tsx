import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/modules/auth/components/AuthCard';

export const metadata: Metadata = { title: 'Verify Email' };

interface Props {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email } = await searchParams;

  return (
    <AuthCard title="Check your email" subtitle="We sent you a verification link">
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl">
          📬
        </div>

        <div className="space-y-2">
          <p className="text-body-md text-muted-foreground">
            We sent a verification link to{' '}
            {email ? (
              <span className="font-medium text-foreground">{email}</span>
            ) : (
              'your email address'
            )}
            .
          </p>
          <p className="text-body-md text-muted-foreground">
            Click the link in that email to activate your account, then come back to sign in.
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-2 text-label text-muted-foreground">Already verified?</p>
          <Link
            href="/login"
            className="text-body-md font-medium text-brand-600 transition-colors hover:text-brand-700"
          >
            Sign in →
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { VerifyEmailForm } from '@/modules/auth/components/VerifyEmailForm';
import { getUser } from '@/modules/auth/services/auth.service';

export const metadata: Metadata = { title: 'Verify Email' };

interface Props {
  searchParams: Promise<{ email?: string; notice?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email: emailParam, notice } = await searchParams;
  const user = await getUser();

  // An unconfirmed user has no session — allow them here via ?email= (set
  // when signup/login redirects them here). No session AND no email means
  // there's nothing to verify, so send them to log in.
  if (!user && !emailParam) redirect('/login');

  const email = user?.email ?? emailParam ?? null;

  return (
    <AuthCard title="Check your email" subtitle="We sent you a verification code">
      <VerifyEmailForm email={email} notice={notice} />
    </AuthCard>
  );
}

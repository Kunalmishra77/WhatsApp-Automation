import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { VerifyEmailForm } from '@/modules/auth/components/VerifyEmailForm';
import { getUser } from '@/modules/auth/services/auth.service';

export const metadata: Metadata = { title: 'Verify Email' };

export default async function VerifyEmailPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <AuthCard title="Check your email" subtitle="We sent you a verification code">
      <VerifyEmailForm email={user.email ?? null} />
    </AuthCard>
  );
}

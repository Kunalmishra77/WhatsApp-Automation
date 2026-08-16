import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { SignupForm } from '@/modules/auth/components/SignupForm';
import { getUser } from '@/modules/auth/services/auth.service';

export const metadata: Metadata = { title: 'Create Account' };

export default async function SignupPage() {
  const user = await getUser();
  // Already authenticated — send them into the onboarding flow, which
  // resolves and redirects to whatever step they're actually on.
  if (user) redirect('/onboarding');

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start automating WhatsApp with Agentix"
    >
      <SignupForm />
    </AuthCard>
  );
}

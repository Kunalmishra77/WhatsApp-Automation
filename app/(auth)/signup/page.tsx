import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { SignupForm } from '@/modules/auth/components/SignupForm';

export const metadata: Metadata = { title: 'Create Account' };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Start managing WhatsApp conversations at scale"
    >
      <SignupForm />
    </AuthCard>
  );
}

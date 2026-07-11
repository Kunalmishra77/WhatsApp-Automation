import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { LoginForm } from '@/modules/auth/components/LoginForm';
import { AuthErrorNotice } from '@/modules/auth/components/AuthErrorNotice';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Agentix workspace"
    >
      <AuthErrorNotice />
      <LoginForm />
    </AuthCard>
  );
}

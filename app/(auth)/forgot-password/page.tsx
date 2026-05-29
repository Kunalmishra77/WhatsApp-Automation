import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { ForgotPasswordForm } from '@/modules/auth/components/ForgotPasswordForm';

export const metadata: Metadata = { title: 'Reset Password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}

import { AuthCard } from '@/modules/auth/components/AuthCard';
import { SessionLimitActions } from './SessionLimitActions';

interface Props {
  searchParams: Promise<{ reason?: string }>;
}

export default async function SessionLimitPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const isRevoked = reason === 'revoked';

  return (
    <AuthCard
      title={isRevoked ? 'Session ended' : 'Too many active sessions'}
      subtitle={
        isRevoked
          ? 'Your session was ended by an administrator or expired.'
          : 'This workspace is already open on the maximum number of browsers.'
      }
    >
      <p className="text-sm text-muted-foreground">
        {isRevoked
          ? 'Please log in again to continue.'
          : 'Log out from another browser or device, then try again.'}
      </p>
      <SessionLimitActions isRevoked={isRevoked} />
    </AuthCard>
  );
}

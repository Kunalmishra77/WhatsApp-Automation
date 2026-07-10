'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/app/actions/auth.actions';

interface Props {
  isRevoked: boolean;
}

export function SessionLimitActions({ isRevoked }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 mt-4">
      {!isRevoked && (
        <Button
          variant="default"
          className="w-full"
          onClick={() => router.push('/conversations')}
        >
          Try again
        </Button>
      )}
      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="w-full">
          Log out
        </Button>
      </form>
    </div>
  );
}

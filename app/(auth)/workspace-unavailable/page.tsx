'use client';

import { useState } from 'react';
import { Building2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown to an INVITED TEAM MEMBER whose organisation's workspace is not usable yet
 * (not activated, or subscription not completed).
 *
 * Members must never be dropped into the owner-only onboarding/subscription wizard:
 * they cannot pay for the organisation or connect its WhatsApp account, so they
 * would be stuck in a flow they can never finish. They get this explanation instead.
 */
export default function WorkspaceUnavailablePage() {
  const [checking, setChecking] = useState(false);

  const checkAgain = () => {
    setChecking(true);
    window.location.href = '/conversations';
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-xl bg-amber-100 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-amber-600" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Workspace not active yet</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your account is set up correctly, but your organisation&apos;s workspace
            isn&apos;t active yet. Only an administrator of your organisation can
            complete this — please ask them to finish the setup.
          </p>
          <p className="text-muted-foreground text-sm">
            Once they do, your access opens automatically. Nothing is needed from you.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={checkAgain} disabled={checking} className="gap-2">
          {checking
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
            : <><RefreshCw className="h-3.5 w-3.5" /> Check again</>}
        </Button>

        <p className="text-xs text-muted-foreground">
          Need help?{' '}
          <a href="mailto:support@agentix.in" className="underline hover:text-foreground">
            support@agentix.in
          </a>
        </p>
      </div>
    </div>
  );
}

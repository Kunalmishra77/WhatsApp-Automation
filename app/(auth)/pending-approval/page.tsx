'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/services/supabase/client';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WorkspaceStatus {
  workspace_id: string;
  workspace_name: string;
  is_active: boolean;
  subscription_status: string;
}

export default function PendingApprovalPage() {
  const router = useRouter();
  const [activated, setActivated]   = useState(false);
  const [checking, setChecking]     = useState(false);
  const [dots, setDots]             = useState('');
  const intervalRef                 = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef                 = useRef<ReturnType<typeof createClient> | null>(null);

  const checkStatus = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/workspace/status', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json() as WorkspaceStatus;
      return data.is_active === true;
    } catch {
      return false;
    }
  };

  const handleActivated = () => {
    setActivated(true);
    // Clean up
    if (intervalRef.current) clearInterval(intervalRef.current);
    realtimeRef.current?.removeAllChannels();
    // Full page reload to clear server-side cache and pick up new is_active state
    setTimeout(() => { window.location.href = '/conversations'; }, 2000);
  };

  useEffect(() => {
    let mounted = true;

    // ── 1. Immediate check ────────────────────────────────────────────────
    void checkStatus().then((active) => {
      if (!mounted) return;
      if (active) { handleActivated(); return; }

      // ── 2. Poll every 5s as primary mechanism ─────────────────────────
      intervalRef.current = setInterval(async () => {
        const active = await checkStatus();
        if (active && mounted) handleActivated();
      }, 5000);

      // ── 3. Supabase Realtime as fast-path ─────────────────────────────
      // Subscribe to changes on workspaces table for this user's workspace
      fetch('/api/workspace/status', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data: WorkspaceStatus) => {
          if (!mounted || !data.workspace_id) return;

          const supabase = createClient();
          realtimeRef.current = supabase as any;

          supabase
            .channel(`workspace-status-${data.workspace_id}`)
            .on(
              'postgres_changes' as any,
              {
                event:  'UPDATE',
                schema: 'public',
                table:  'workspaces',
                filter: `id=eq.${data.workspace_id}`,
              },
              (payload: { new: { is_active?: boolean } }) => {
                if (payload.new?.is_active === true && mounted) {
                  handleActivated();
                }
              },
            )
            .subscribe();
        })
        .catch(() => {});
    });

    // Animate waiting dots
    const dotInterval = setInterval(() => {
      if (!mounted) return;
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 600);

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(dotInterval);
      realtimeRef.current?.removeAllChannels();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualCheck = async () => {
    setChecking(true);
    const active = await checkStatus();
    setChecking(false);
    if (active) {
      handleActivated();
    } else {
      // Shake the button to indicate still pending — no-op here, just visual feedback
    }
  };

  if (activated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Account Activated!</h1>
            <p className="text-muted-foreground text-sm">
              Your account is now active. Taking you to the dashboard{dots}
            </p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirecting to dashboard…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-xl font-bold">
            A
          </div>
        </div>

        {/* Status */}
        <div className="space-y-3">
          <div className="text-4xl">⏳</div>
          <h1 className="text-2xl font-bold text-foreground">Account Pending Approval</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your account setup is complete. Our team is reviewing your details
            and will activate your account shortly.
          </p>
        </div>

        {/* Live waiting indicator */}
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 flex items-center gap-2 justify-center">
          <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse shrink-0" />
          Waiting for approval{dots} (page will update automatically)
        </div>

        {/* Manual refresh button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleManualCheck()}
          disabled={checking}
          className="gap-2"
        >
          {checking
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
            : <><RefreshCw className="h-3.5 w-3.5" /> Check now</>}
        </Button>

        <p className="text-xs text-muted-foreground">
          Questions?{' '}
          <a href="mailto:support@agentix.in" className="underline hover:text-foreground">
            support@agentix.in
          </a>
        </p>
      </div>
    </div>
  );
}

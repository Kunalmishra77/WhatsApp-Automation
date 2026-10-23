'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Without a boundary here, one thrown error in any dashboard page takes the whole
// route down and the client is shown a bare not-found page: no message, no way
// back, and nothing that says what happened. A campaign wizard crash reached a
// client exactly that way, and read as "the product is broken" rather than "one
// screen failed".
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server log entry for the same error.
    console.error('[Dashboard]', error.digest ?? '', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card shadow-sm p-6 text-center space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <div className="space-y-1">
          <h1 className="text-base font-semibold text-foreground">This page didn&apos;t load</h1>
          <p className="text-sm text-muted-foreground">
            Something went wrong on this screen. The rest of your workspace is unaffected.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button onClick={reset} className="bg-brand-500 hover:bg-brand-600 text-white gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = '/dashboard'; }}>
            Back to dashboard
          </Button>
        </div>

        {error.digest && (
          <p className="text-[11px] text-muted-foreground">
            If it keeps happening, quote this code to support: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}

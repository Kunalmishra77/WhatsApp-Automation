'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, History, RotateCcw, AlertTriangle, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Every saved version of this flow, and a way back to one.
//
// Non-technical people edit live flows, and until this existed a client who
// deleted the wrong branch at 11pm had no way back and no way to see what had
// changed. Each row says what the save did — "removed 2 steps", "rewired
// connections" — because a list of timestamps makes someone restore versions
// one at a time to find the one they want.
//
// A restore is confirmed, and the dialog says the two things that are easy to
// get wrong about it: the current version is kept, so the restore is itself
// undoable, and anyone mid-conversation starts again.

interface Props {
  flowId: string;
  onClose: () => void;
  /** Called after a restore, so the editor reloads the flow it is showing. */
  onRestored: () => void;
}

interface Version {
  id: string;
  name: string | null;
  createdAt: string;
  isCurrent: boolean;
  stepCount: number;
  by: string | null;
  source: string;
  change: string;
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${time}`;
}

export function FlowVersions({ flowId, onClose, onRestored }: Props) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<Version | null>(null);

  const { data, isLoading, isError, error } = useQuery<{ versions: Version[] }>({
    queryKey: ['flow', 'versions', flowId],
    queryFn: () =>
      fetch(`/api/flows/${flowId}/versions`).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Could not read the history.');
        return body as { versions: Version[] };
      }),
    retry: false,
  });

  const restore = useMutation({
    mutationFn: (versionId: string) =>
      fetch(`/api/flows/${flowId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Could not restore that version.');
        return body;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['flow', flowId] });
      void queryClient.invalidateQueries({ queryKey: ['flow', 'versions', flowId] });
      const restored = confirming;
      setConfirming(null);
      toast.success(
        restored ? `Restored the version from ${when(restored.createdAt)}.` : 'Version restored.',
        { description: 'The version you had is still in the history.' },
      );
      onRestored();
    },
    onError: (err) => {
      // Named, not swallowed: the one thing worse than a failed restore is a
      // dialog that closes as though it worked.
      toast.error(err instanceof Error ? err.message : 'Could not restore that version.');
    },
  });

  const versions = data?.versions ?? [];

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">History</p>
            <p className="text-[11px] text-muted-foreground">Last 50 saves</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <div className="flex flex-1 items-start gap-2 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Could not read the history.'}
          </p>
        </div>
      )}

      {data && (
        <div className="flex-1 overflow-y-auto p-3">
          <ol className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className={`rounded-md border p-2.5 ${v.isCurrent ? 'border-brand-200 bg-brand-50/50' : 'border-border bg-card'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{when(v.createdAt)}</span>
                  {v.isCurrent && (
                    <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                      Now
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{v.change}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  {/* 'sql' means nothing attributed it: a migration, or a direct
                      edit to the database. Worth naming rather than showing a
                      blank where a person's name goes. */}
                  {v.source === 'sql' ? (
                    <>
                      <Database className="h-2.5 w-2.5" />
                      Changed directly in the database
                    </>
                  ) : (
                    <>{v.by ?? 'A team member'}</>
                  )}
                  {' · '}
                  {v.stepCount} {v.stepCount === 1 ? 'step' : 'steps'}
                </p>
                {!v.isCurrent && (
                  <Button
                    variant="outline" size="sm"
                    className="mt-2 h-7 w-full gap-1.5 text-[11px]"
                    onClick={() => setConfirming(v)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore this
                  </Button>
                )}
              </li>
            ))}
          </ol>
          {versions.length === 0 && (
            <p className="text-xs text-muted-foreground">No saves recorded yet.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        variant="warning"
        confirmLabel="Restore"
        loading={restore.isPending}
        title={`Restore the version from ${confirming ? when(confirming.createdAt) : ''}?`}
        description={
          `${confirming?.change ?? ''}. The version you have now is kept, so you can come ` +
          'straight back to it. Anyone part-way through this flow will start again on their ' +
          'next message, because their current step may not exist in the version you are restoring.'
        }
        onConfirm={() => { if (confirming) restore.mutate(confirming.id); }}
        onCancel={() => { if (!restore.isPending) setConfirming(null); }}
      />
    </div>
  );
}

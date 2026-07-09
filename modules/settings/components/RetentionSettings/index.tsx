'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Trash2, Download, BarChart2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface RetentionStats {
  cutoff: string;
  months: number;
  conversations: number;
  messages: number;
}

export function RetentionSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');

  const [months,        setMonths]        = useState(2);
  const [stats,         setStats]         = useState<RetentionStats | null>(null);
  const [loadingStats,  setLoadingStats]  = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [confirmed,     setConfirmed]     = useState(false);

  const loadStats = async () => {
    if (!workspaceId) return;
    setLoadingStats(true);
    setStats(null);
    setConfirmed(false);
    try {
      const r = await fetch(`/api/workspace/retention?workspaceId=${workspaceId}&months=${months}`);
      const d = await r.json() as RetentionStats & { error?: string };
      if (!r.ok) { toast.error(d.error ?? 'Failed to load stats'); return; }
      setStats(d);
    } catch {
      toast.error('Network error');
    } finally {
      setLoadingStats(false);
    }
  };

  const handleExport = async () => {
    if (!workspaceId || !stats) return;
    setLoadingExport(true);
    try {
      const r = await fetch('/api/workspace/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, months, action: 'export' }),
      });
      if (!r.ok) { const d = await r.json() as { error?: string }; toast.error(d.error ?? 'Export failed'); return; }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `archive_before_${stats.cutoff.slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Archive exported successfully');
    } catch {
      toast.error('Network error');
    } finally {
      setLoadingExport(false);
    }
  };

  const handleDelete = async () => {
    if (!workspaceId || !stats || !confirmed) return;
    setLoadingDelete(true);
    try {
      const r = await fetch('/api/workspace/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, months, action: 'delete' }),
      });
      const d = await r.json() as { deleted?: { conversations: number; messages: number }; error?: string };
      if (!r.ok) { toast.error(d.error ?? 'Delete failed'); return; }
      toast.success(`Deleted ${d.deleted?.conversations ?? 0} conversations and ${d.deleted?.messages ?? 0} messages`);
      setStats(null);
      setConfirmed(false);
    } catch {
      toast.error('Network error');
    } finally {
      setLoadingDelete(false);
    }
  };

  const cutoffLabel = stats
    ? new Date(stats.cutoff).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Data Retention</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage old conversation data to keep your workspace clean. Export before deleting.
        </p>
      </div>

      {/* Retention window picker */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Retention Period</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Find all conversations whose last message is older than the selected period.
        </p>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-foreground whitespace-nowrap">Older than</label>
          <select
            value={months}
            onChange={(e) => { setMonths(Number(e.target.value)); setStats(null); setConfirmed(false); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground w-36"
          >
            {[1, 2, 3, 6, 12].map((m) => (
              <option key={m} value={m}>{m} {m === 1 ? 'month' : 'months'}</option>
            ))}
          </select>
          <button
            onClick={loadStats}
            disabled={loadingStats}
            className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            {loadingStats ? 'Analysing…' : 'Analyse'}
          </button>
        </div>
      </div>

      {/* Stats + actions */}
      {stats && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Analysis Result</h3>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium mb-1">Data older than {cutoffLabel}</p>
            <ul className="list-disc pl-5 space-y-0.5 text-xs">
              <li><span className="font-semibold">{stats.conversations.toLocaleString()}</span> conversations</li>
              <li><span className="font-semibold">{stats.messages.toLocaleString()}</span> messages</li>
            </ul>
          </div>

          {stats.conversations === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>No data found beyond the selected period — nothing to archive.</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Recommended:</span> Export a backup first, then delete.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleExport}
                  disabled={loadingExport}
                  className="flex items-center gap-1.5 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {loadingExport ? 'Exporting…' : 'Export Archive (.xlsx)'}
                </button>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400">
                    <span className="font-semibold">Permanent action.</span> Deleted conversations and messages cannot be recovered. Export first.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="rounded border-border"
                  />
                  I have exported a backup and understand this cannot be undone
                </label>

                <button
                  onClick={handleDelete}
                  disabled={!confirmed || loadingDelete}
                  className="flex items-center gap-1.5 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {loadingDelete ? 'Deleting…' : `Delete ${stats.conversations.toLocaleString()} Conversations`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

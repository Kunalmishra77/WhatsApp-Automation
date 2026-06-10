'use client';

import { useState, useEffect } from 'react';
import {
  Activity, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, Loader2, ChevronDown, ChevronUp, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CheckResult {
  status: 'ok' | 'warning' | 'error';
  message: string;
  value?: number | string;
}

interface HealthReport {
  id: string;
  checked_at: string;
  overall_status: 'healthy' | 'warning' | 'critical';
  checks: Record<string, CheckResult>;
  errors: string[];
  has_errors: boolean;
  error_resolved_at: string | null;
}

const STATUS_ICON: Record<string, React.ElementType> = {
  healthy:  CheckCircle2,
  warning:  AlertTriangle,
  critical: XCircle,
  ok:       CheckCircle2,
  error:    XCircle,
};
const STATUS_COLOR: Record<string, string> = {
  healthy:  'text-green-600',
  warning:  'text-amber-500',
  critical: 'text-red-600',
  ok:       'text-green-500',
  error:    'text-red-500',
};
const STATUS_BADGE: Record<string, string> = {
  healthy:  'bg-green-100 text-green-700',
  warning:  'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

const CHECK_LABELS: Record<string, string> = {
  db_connectivity:        'Database',
  workspaces:             'Workspaces',
  messages_last_hour:     'Messages (1h)',
  open_support_tickets:   'Support Tickets',
  campaign_failures_24h:  'Campaign Failures (24h)',
  halted_workspaces:      'Halted Clients',
};

export function HealthMonitor() {
  const [reports,  setReports]  = useState<HealthReport[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadReports = () => {
    setLoading(true);
    fetch('/api/admin/health-reports?limit=10')
      .then(r => r.json() as Promise<{ reports: HealthReport[] }>)
      .then(d => setReports(d.reports ?? []))
      .catch(() => toast.error('Failed to load health reports'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadReports(); }, []);

  const runCheck = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/cron/health-monitor');
      if (!res.ok) throw new Error('Check failed');
      toast.success('Health check complete');
      loadReports();
    } catch {
      toast.error('Health check failed');
    } finally {
      setRunning(false);
    }
  };

  const resolveError = async (id: string) => {
    try {
      await fetch('/api/admin/health-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      toast.success('Marked as resolved');
      loadReports();
    } catch {
      toast.error('Failed');
    }
  };

  const latest = reports[0];
  const formatTime = (d: string) =>
    new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Platform Health</h2>
          {latest && (
            <Badge className={cn('text-xs', STATUS_BADGE[latest.overall_status] ?? '')}>
              {latest.overall_status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={loadReports} disabled={loading}>
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={runCheck} disabled={running}>
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Activity className="h-3 w-3" />Run Check</>}
          </Button>
        </div>
      </div>

      {/* Latest check summary */}
      {latest && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            {(() => { const Icon = STATUS_ICON[latest.overall_status] ?? CheckCircle2; return <Icon className={cn('h-5 w-5', STATUS_COLOR[latest.overall_status])} />; })()}
            <div>
              <p className="text-sm font-medium">Last check: {formatTime(latest.checked_at)}</p>
              {latest.errors.length > 0 && (
                <p className="text-xs text-red-600 mt-0.5">{latest.errors.join(' · ')}</p>
              )}
            </div>
            {latest.has_errors && (
              <Button
                size="sm" variant="outline"
                className="ml-auto h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => resolveError(latest.id)}
              >
                <ShieldCheck className="h-3 w-3" /> Resolve
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(latest.checks).map(([key, check]) => {
              const Icon = STATUS_ICON[check.status] ?? CheckCircle2;
              return (
                <div key={key} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', STATUS_COLOR[check.status])} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">{CHECK_LABELS[key] ?? key}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{check.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Report history */}
      {reports.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Report History</p>
          <div className="rounded-lg border divide-y divide-border">
            {reports.slice(1).map(r => {
              const Icon = STATUS_ICON[r.overall_status] ?? CheckCircle2;
              return (
                <div key={r.id}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', STATUS_COLOR[r.overall_status])} />
                    <span className="text-sm flex-1">{formatTime(r.checked_at)}</span>
                    <Badge className={cn('text-[10px] px-1.5', STATUS_BADGE[r.overall_status] ?? '')}>{r.overall_status}</Badge>
                    {r.has_errors && <Badge className="text-[10px] px-1.5 bg-red-100 text-red-700">unresolved</Badge>}
                    {expanded === r.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {expanded === r.id && r.errors.length > 0 && (
                    <div className="px-4 pb-3 space-y-1">
                      {r.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600 flex items-center gap-1.5">
                          <XCircle className="h-3 w-3 shrink-0" />{e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && reports.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

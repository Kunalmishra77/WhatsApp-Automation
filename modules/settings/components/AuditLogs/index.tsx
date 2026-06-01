'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardList, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  profiles: { id: string; full_name: string | null; email: string } | null;
}

const ACTION_COLOR: Record<string, string> = {
  created:   'bg-green-100 text-green-700',
  updated:   'bg-blue-100 text-blue-700',
  deleted:   'bg-red-100 text-red-700',
  resolved:  'bg-purple-100 text-purple-700',
  assigned:  'bg-amber-100 text-amber-700',
  sent:      'bg-teal-100 text-teal-700',
};

function actionColor(action: string) {
  const key = Object.keys(ACTION_COLOR).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLOR[key] : 'bg-gray-100 text-gray-700';
}

const ENTITY_ICONS: Record<string, string> = {
  conversation: '💬', contact: '👤', lead: '🏆', campaign: '📢',
  message: '✉️', template: '📋', flow: '🔀', shopify_order: '🛍️',
};

export function AuditLogs() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  // Filters
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchLogs = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        workspaceId,
        page: String(page),
        limit: String(LIMIT),
      });
      if (search)     params.set('action', search);
      if (entityType) params.set('entityType', entityType);
      if (fromDate)   params.set('from', fromDate);
      if (toDate)     params.set('to', toDate);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await res.json() as { logs?: LogEntry[]; meta?: { total: number } };
      setLogs(data.logs ?? []);
      setTotal(data.meta?.total ?? 0);
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  }, [workspaceId, page, search, entityType, fromDate, toDate]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const handleExport = () => {
    if (logs.length === 0) return;
    const csv = [
      ['Time', 'Action', 'Entity Type', 'Entity ID', 'Actor', 'Details'].join(','),
      ...logs.map((l) => [
        format(new Date(l.created_at), 'yyyy-MM-dd HH:mm:ss'),
        l.action,
        l.entity_type,
        l.entity_id,
        l.profiles?.full_name ?? l.profiles?.email ?? 'System',
        JSON.stringify(l.metadata).replace(/,/g, ';'),
      ].map((v) => `"${v}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-brand-500" />
            Audit Logs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete activity trail — kaun kya kiya, kab kiya.
            {total > 0 && <span className="ml-1 font-medium text-foreground">{total.toLocaleString()} entries.</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={logs.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search action…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
        >
          <option value="">All types</option>
          {['conversation', 'contact', 'lead', 'campaign', 'message', 'template', 'flow', 'shopify_order'].map((t) => (
            <option key={t} value={t}>{ENTITY_ICONS[t]} {t}</option>
          ))}
        </select>
        <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} />
        <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} />
        {(search || entityType || fromDate || toDate) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSearch(''); setEntityType(''); setFromDate(''); setToDate(''); setPage(0); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Log list */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <ClipboardList className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No activity logs found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {logs.map((log) => {
              const icon = ENTITY_ICONS[log.entity_type] ?? '📌';
              const actor = log.profiles?.full_name ?? log.profiles?.email ?? 'System';
              const metaKeys = Object.keys(log.metadata ?? {}).slice(0, 3);

              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <span className="text-base mt-0.5 shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', actionColor(log.action))}>
                        {log.action}
                      </span>
                      <span className="text-xs text-muted-foreground">{log.entity_type}</span>
                      {metaKeys.map((k) => (
                        <span key={k} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {k}: {String(log.metadata[k]).slice(0, 20)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      by <span className="font-medium text-foreground">{actor}</span>
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
                    {format(new Date(log.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} ({total.toLocaleString()} total)
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

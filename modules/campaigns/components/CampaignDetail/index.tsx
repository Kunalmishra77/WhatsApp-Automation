'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/store/workspace.store';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft, Download, MessageSquare,
  Send, CheckCheck, Eye, XCircle, Reply, Users, Clock, Timer,
} from 'lucide-react';
import { format, formatDistanceStrict } from 'date-fns';
import { cn } from '@/lib/utils';

// Formats duration between two timestamps to human-readable string
function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  const end   = completedAt ? new Date(completedAt) : new Date();
  return formatDistanceStrict(start, end);
}

// Calculates send speed: messages per minute
function sendSpeed(total: number, startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || total === 0) return null;
  const start = new Date(startedAt);
  const end   = completedAt ? new Date(completedAt) : new Date();
  const mins  = (end.getTime() - start.getTime()) / 60_000;
  if (mins < 0.01) return null;
  return `${Math.round(total / mins)}/min`;
}

interface Recipient {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  error_message: string | null;
  conversation_id: string | null;
}

interface Stats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
}

interface CampaignDetailData {
  campaign: {
    id: string;
    name: string;
    status: string;
    total_recipients: number;
    sent_count: number;
    failed_count: number;
    delivered_count: number;
    read_count: number;
    started_at: string | null;
    completed_at: string | null;
    media_id: string | null;
    media_type: string | null;
    templates: { name: string } | null;
  };
  stats: Stats;
  recipients: Recipient[];
  total: number;
  page: number;
  pages: number;
}

const STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  sent:      { label: 'Sent',      className: 'bg-blue-100 text-blue-700',   icon: Send      },
  delivered: { label: 'Delivered', className: 'bg-sky-100 text-sky-700',     icon: CheckCheck },
  read:      { label: 'Read',      className: 'bg-violet-100 text-violet-700', icon: Eye     },
  replied:   { label: 'Replied',   className: 'bg-emerald-100 text-emerald-700', icon: Reply },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-700',     icon: XCircle   },
};

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  running:   'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-700',
};

const FILTER_TABS = [
  { key: 'all',      label: 'All',       icon: Users     },
  { key: 'sent',     label: 'Sent',      icon: Send      },
  { key: 'delivered',label: 'Delivered', icon: CheckCheck },
  { key: 'read',     label: 'Read',      icon: Eye       },
  { key: 'replied',  label: 'Replied',   icon: Reply     },
  { key: 'failed',   label: 'Failed',    icon: XCircle   },
];

async function fetchCampaignDetail(campaignId: string, workspaceId: string, status: string, page: number): Promise<CampaignDetailData> {
  const params = new URLSearchParams({ workspaceId, status, page: String(page) });
  const res = await fetch(`/api/campaigns/${campaignId}/recipients?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch campaign detail');
  return res.json() as Promise<CampaignDetailData>;
}

interface RecipientWithLead extends Recipient {
  lead_stage?:       string;
  lead_temperature?: string;
  lead_value?:       number | null;
}

async function exportCSVWithLeads(campaignId: string, workspaceId: string, campaignName: string) {
  // Fetch ALL recipients (no pagination) with lead data
  const params = new URLSearchParams({ workspaceId, status: 'all', page: '1', limit: '10000', export: '1' });
  const res    = await fetch(`/api/campaigns/${campaignId}/recipients?${params}`);
  const data   = await res.json() as { recipients?: RecipientWithLead[]; leads_map?: Record<string, { stage: string; temperature: string; value: number | null }> };

  const recipients = data?.recipients ?? [];

  const header = [
    'Name', 'Phone', 'Status',
    'Sent At', 'Delivered At', 'Read At', 'Replied At',
    'Lead Stage', 'Lead Temperature', 'Lead Value (₹)',
    'Error',
  ].join(',');

  const rows = recipients.map((r) => {
    const lead = data?.leads_map?.[r.phone] ?? null;
    return [
      r.name ?? '',
      r.phone,
      r.status,
      r.sent_at      ? format(new Date(r.sent_at),      'yyyy-MM-dd HH:mm') : '',
      r.delivered_at ? format(new Date(r.delivered_at), 'yyyy-MM-dd HH:mm') : '',
      r.read_at      ? format(new Date(r.read_at),      'yyyy-MM-dd HH:mm') : '',
      r.replied_at   ? format(new Date(r.replied_at),   'yyyy-MM-dd HH:mm') : '',
      lead?.stage       ?? '',
      lead?.temperature ?? '',
      lead?.value != null ? String(lead.value) : '',
      r.error_message ?? '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv  = [header, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${campaignName.replace(/\s+/g, '_')}_full_export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface CampaignDetailProps { campaignId: string }

export function CampaignDetail({ campaignId }: CampaignDetailProps) {
  const router      = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [filter, setFilter] = useState('all');
  const [page, setPage]     = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['campaign-detail', campaignId, workspaceId, filter, page],
    queryFn:  () => fetchCampaignDetail(campaignId, workspaceId, filter, page),
    enabled:  !!workspaceId,
    refetchInterval: (q) => q.state.data?.campaign?.status === 'running' ? 5000 : false,
  });

  const campaign   = data?.campaign;
  const stats      = data?.stats   ?? { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 };
  const recipients = data?.recipients ?? [];

  const deliveryPct = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
  const readPct     = stats.delivered > 0 ? Math.round((stats.read / stats.delivered) * 100) : 0;
  const replyPct    = stats.total > 0 ? Math.round((stats.replied / stats.total) * 100) : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/campaigns')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {isLoading
            ? <Skeleton className="h-5 w-48" />
            : <h1 className="truncate text-base font-semibold text-foreground">{campaign?.name}</h1>}
        </div>
        {campaign && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize', CAMPAIGN_STATUS_COLORS[campaign.status] ?? 'bg-gray-100 text-gray-600')}>
            {campaign.status}
          </span>
        )}
        <Button
          size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
          onClick={() => campaign && void exportCSVWithLeads(campaignId, workspaceId, campaign.name)}
          disabled={!campaign || campaign.status === 'draft'}
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total',     value: stats.total,     icon: Users,      color: 'text-foreground'        },
            { label: 'Sent',      value: stats.sent,      icon: Send,       color: 'text-blue-600'          },
            { label: 'Delivered', value: stats.delivered, icon: CheckCheck, color: 'text-sky-600'           },
            { label: 'Read',      value: stats.read,      icon: Eye,        color: 'text-violet-600'        },
            { label: 'Replied',   value: stats.replied,   icon: Reply,      color: 'text-emerald-600'       },
            { label: 'Failed',    value: stats.failed,    icon: XCircle,    color: 'text-red-600'           },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn('h-4 w-4', color)} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              {isLoading
                ? <Skeleton className="h-6 w-10" />
                : <p className="text-2xl font-bold text-foreground">{value}</p>}
            </div>
          ))}
        </div>

        {/* Duration + Speed row */}
        {campaign?.started_at && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">Duration</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {formatDuration(campaign.started_at, campaign.completed_at) ?? 'Running…'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {campaign.started_at ? `Started ${format(new Date(campaign.started_at), 'HH:mm, MMM d')}` : ''}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-brand-500" />
                <span className="text-xs text-muted-foreground">Send Speed</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {sendSpeed(stats.sent, campaign.started_at, campaign.completed_at) ?? '—'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">messages per minute</p>
            </div>
            {campaign.completed_at && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCheck className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">Completed</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {format(new Date(campaign.completed_at), 'HH:mm')}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {format(new Date(campaign.completed_at), 'MMM d, yyyy')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Progress bars */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Funnel</h2>
          {[
            { label: 'Delivery Rate', pct: deliveryPct, color: 'bg-sky-500'     },
            { label: 'Read Rate',     pct: readPct,     color: 'bg-violet-500'  },
            { label: 'Reply Rate',    pct: replyPct,    color: 'bg-emerald-500' },
          ].map(({ label, pct, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-28 text-xs text-muted-foreground shrink-0">{label}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-10 text-right text-xs font-medium text-foreground">{pct}%</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border px-4 py-2 overflow-x-auto">
            {FILTER_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setFilter(key); setPage(1); }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                  filter === key
                    ? 'bg-brand-500 text-white'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {key !== 'all' && (
                  <span className={cn('ml-0.5 text-[10px]', filter === key ? 'text-white/80' : 'text-muted-foreground')}>
                    {stats[key as keyof Stats] ?? 0}
                  </span>
                )}
              </button>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Replied</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : recipients.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                        No recipients yet — run the campaign to see tracking data.
                      </TableCell>
                    </TableRow>
                  )
                  : recipients.map((r) => {
                      const s = STATUS_STYLES[r.status] ?? STATUS_STYLES['sent']!;
                      const Icon = s.icon;
                      return (
                        <TableRow key={r.id} className="hover:bg-accent">
                          <TableCell className="font-medium text-sm">{r.name ?? '—'}</TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">{r.phone}</TableCell>
                          <TableCell>
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', s.className)}>
                              <Icon className="h-3 w-3" /> {s.label}
                            </span>
                            {r.status === 'failed' && r.error_message && (
                              <p className="text-[10px] text-red-500 mt-0.5 max-w-32 truncate" title={r.error_message}>{r.error_message}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.sent_at ? format(new Date(r.sent_at), 'MMM d, HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.delivered_at ? format(new Date(r.delivered_at), 'MMM d, HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.read_at ? format(new Date(r.read_at), 'MMM d, HH:mm') : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.replied_at ? format(new Date(r.replied_at), 'MMM d, HH:mm') : '—'}
                          </TableCell>
                          <TableCell>
                            {r.conversation_id && (
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                title="Open conversation"
                                onClick={() => router.push(`/conversations/${r.conversation_id}`)}
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {(data?.pages ?? 0) > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Page {page} of {data?.pages} ({data?.total} recipients)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === data?.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

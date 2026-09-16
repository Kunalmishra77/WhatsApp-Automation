'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Radar, RefreshCw, Users } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';

// Channel display metadata — label + a soft badge colour per normalized channel.
const CHANNEL_META: Record<string, { label: string; cls: string; bar: string }> = {
  whatsapp:    { label: 'WhatsApp',      cls: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  instagram:   { label: 'Instagram',    cls: 'bg-purple-100 text-purple-700',   bar: 'bg-purple-500' },
  meta_ads:    { label: 'Meta Ads',     cls: 'bg-blue-100 text-blue-700',       bar: 'bg-blue-500' },
  google_ads:  { label: 'Google Ads',   cls: 'bg-red-100 text-red-700',         bar: 'bg-red-500' },
  gbp:         { label: 'Google Business', cls: 'bg-cyan-100 text-cyan-700',     bar: 'bg-cyan-500' },
  website:     { label: 'Website',      cls: 'bg-indigo-100 text-indigo-700',   bar: 'bg-indigo-500' },
  chat_widget: { label: 'Chat Widget',  cls: 'bg-indigo-100 text-indigo-700',   bar: 'bg-indigo-500' },
  campaign:    { label: 'Campaign',     cls: 'bg-amber-100 text-amber-700',     bar: 'bg-amber-500' },
  api:         { label: 'API',          cls: 'bg-slate-100 text-slate-700',     bar: 'bg-slate-500' },
  referral:    { label: 'Referral',     cls: 'bg-pink-100 text-pink-700',       bar: 'bg-pink-500' },
  manual:      { label: 'Manual',       cls: 'bg-gray-100 text-gray-600',       bar: 'bg-gray-400' },
  other:       { label: 'Other',        cls: 'bg-gray-100 text-gray-500',       bar: 'bg-gray-400' },
};
const chMeta = (c: string | null) => CHANNEL_META[c ?? 'other'] ?? CHANNEL_META.other!;

const PAGE_SIZE = 50;

type UnifiedLead = {
  id: string;
  title: string | null;
  stage: string;
  temperature: string | null;
  value: number | null;
  currency: string | null;
  channel: string | null;
  source: string | null;
  source_detail: string | null;
  created_at: string;
  contacts: { id: string; name: string | null; phone: string } | null;
};

type SourceRow = { channel: string; leads: number; converted: number; conversion_rate: number };

export default function UnifiedLeadsPage() {
  useRequirePageRole('unified-leads');
  const router = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const [page,    setPage]    = useState(0);
  const [channel, setChannel] = useState('all');
  const [stage,   setStage]   = useState('all');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [search,  setSearch]  = useState('');

  const listParams = new URLSearchParams({ workspaceId: workspaceId ?? '', page: String(page), pageSize: String(PAGE_SIZE) });
  if (channel !== 'all') listParams.set('channel', channel);
  if (stage   !== 'all') listParams.set('stage', stage);
  if (from) listParams.set('from', from);
  if (to)   listParams.set('to', to);
  if (search.trim()) listParams.set('search', search.trim());

  const srcParams = new URLSearchParams({ workspaceId: workspaceId ?? '' });
  if (from) srcParams.set('from', from);
  if (to)   srcParams.set('to', to);

  const { data: list, isLoading, refetch } = useQuery({
    queryKey: ['leads-unified', workspaceId, page, channel, stage, from, to, search],
    queryFn: () => fetch(`/api/leads/unified?${listParams}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 20_000,
  });

  const { data: sources, refetch: refetchSources } = useQuery({
    queryKey: ['lead-sources', workspaceId, from, to],
    queryFn: () => fetch(`/api/analytics/lead-sources?${srcParams}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 20_000,
  });

  const leads: UnifiedLead[] = list?.data ?? [];
  const total: number = list?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const srcRows: SourceRow[] = sources?.sources ?? [];
  const srcMax = Math.max(1, ...srcRows.map((s) => s.leads));
  const grandTotal: number = sources?.totals?.leads ?? 0;
  const hasFilters = channel !== 'all' || stage !== 'all' || !!from || !!to || !!search.trim();

  const tempCls = (t: string | null) =>
    t === 'hot' ? 'border-red-200 text-red-700 bg-red-50'
    : t === 'warm' ? 'border-amber-200 text-amber-700 bg-amber-50'
    : 'border-sky-200 text-sky-700 bg-sky-50';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radar className="h-6 w-6 text-brand-500" />
            Unified Leads
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Every lead from every channel — one place, with its source and journey
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void refetch(); void refetchSources(); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Source breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-gray-900">Leads by source</h2>
          <span className="text-xs text-gray-400">{grandTotal.toLocaleString('en-IN')} total</span>
        </div>
        {!sources ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : srcRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No leads yet.</p>
        ) : (
          <div className="space-y-2.5">
            {srcRows.map((s) => {
              const m = chMeta(s.channel);
              return (
                <div key={s.channel} className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 w-32 text-center ${m.cls}`}>
                    {m.label}
                  </span>
                  <div className="flex-1 h-6 rounded-md bg-gray-50 overflow-hidden">
                    <div
                      className={`h-full ${m.bar} rounded-md transition-all`}
                      style={{ width: `${Math.max(3, (s.leads / srcMax) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 tabular-nums w-12 text-right">{s.leads}</span>
                  <span className="text-[11px] text-gray-400 tabular-nums w-16 text-right">{s.conversion_rate}% conv</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Channel</label>
            <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {Object.entries(CHANNEL_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Stage</label>
            <Select value={stage} onValueChange={(v) => { setStage(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="h-9 w-38 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="h-9 w-38 text-sm" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500">Search</label>
            <Input placeholder="Lead title…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="h-9 text-sm" />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs"
              onClick={() => { setChannel('all'); setStage('all'); setFrom(''); setTo(''); setSearch(''); setPage(0); }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Temp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
              {!isLoading && leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <Radar className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No leads match your filters</p>
                    <p className="text-xs text-gray-400 mt-1">Leads from every channel will appear here as they come in.</p>
                  </td>
                </tr>
              )}
              {!isLoading && leads.map((lead) => {
                const m = chMeta(lead.channel);
                return (
                  <tr
                    key={lead.id}
                    className="border-b border-gray-50 hover:bg-brand-50/20 cursor-pointer transition-colors"
                    onClick={() => lead.contacts?.id && router.push(`/contacts/${lead.contacts.id}`)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-brand-50 flex items-center justify-center text-xs font-bold text-brand-600 shrink-0">
                          {(lead.contacts?.name ?? lead.contacts?.phone ?? lead.title ?? '?')[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 text-xs leading-tight truncate max-w-[200px]">
                            {lead.contacts?.name ?? lead.title ?? 'Lead'}
                          </p>
                          <p className="text-gray-400 text-xs">{lead.contacts?.phone ?? ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                      <p className="text-xs text-gray-600 truncate">{lead.source_detail ?? lead.source ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs capitalize text-gray-700">{lead.stage?.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {lead.temperature && (
                        <Badge variant="outline" className={`text-xs capitalize ${tempCls(lead.temperature)}`}>
                          {lead.temperature}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {total.toLocaleString('en-IN')} lead{total !== 1 ? 's' : ''}{hasFilters ? ' (filtered)' : ''} · Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

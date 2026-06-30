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
import { Brain, Download, Users, CalendarDays, TrendingUp, RefreshCw } from 'lucide-react';

type Lead = {
  id: string;
  status: string;
  created_at: string;
  contact: { id: string; name: string | null; phone: string } | null;
  platform: string;
  ad_headline: string | null;
  ad_body: string | null;
  ad_id: string | null;
  first_message: string | null;
  first_message_at: string;
};

export default function MetaLeadsPage() {
  const router = useRouter();
  const [page,     setPage]     = useState(1);
  const [platform, setPlatform] = useState('all');
  const [status,   setStatus]   = useState('all');
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');

  const params = new URLSearchParams({ page: String(page) });
  if (platform !== 'all') params.set('platform', platform);
  if (status   !== 'all') params.set('status',   status);
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['meta-leads', page, platform, status, from, to],
    queryFn: () => fetch(`/api/meta-leads?${params}`).then((r) => r.json()),
    staleTime: 30_000,
  });

  const leads: Lead[]  = data?.leads ?? [];
  const kpis           = data?.kpis  ?? {};
  const totalPages: number = data?.totalPages ?? 1;

  function handleExport() {
    const exp = new URLSearchParams();
    if (platform !== 'all') exp.set('platform', platform);
    if (status   !== 'all') exp.set('status',   status);
    if (from) exp.set('from', from);
    if (to)   exp.set('to',   to);
    window.open(`/api/meta-leads/export?${exp}`, '_blank');
  }

  const platformColor = (p: string) =>
    p === 'instagram' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="h-6 w-6 text-orange-500" />
            Meta Ad Leads
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Conversations originating from Facebook &amp; Instagram advertisements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={handleExport} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Ad Leads',  value: kpis.total,      icon: Users,        color: 'bg-orange-500' },
          { label: "Today's Leads",   value: kpis.today,      icon: CalendarDays, color: 'bg-blue-500'   },
          { label: 'This Month',      value: kpis.this_month, icon: TrendingUp,   color: 'bg-emerald-500'},
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3 ${color}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            {isLoading
              ? <Skeleton className="h-7 w-16" />
              : <p className="text-2xl font-bold text-gray-900 tabular-nums">{value ?? 0}</p>}
            <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Platform</label>
            <Select value={platform} onValueChange={(v) => { setPlatform(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-38 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-38 text-sm" />
          </div>
          {(platform !== 'all' || status !== 'all' || from || to) && (
            <Button variant="ghost" size="sm" className="h-9 text-xs"
              onClick={() => { setPlatform('all'); setStatus('all'); setFrom(''); setTo(''); setPage(1); }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ad</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">First Message</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
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
                  <Brain className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">No Meta ad leads yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    When customers click your Facebook or Instagram ads and send a message, they&apos;ll appear here.
                  </p>
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-gray-50 hover:bg-orange-50/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/conversations/${lead.id}`)}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-500 shrink-0">
                      {(lead.contact?.name ?? lead.contact?.phone ?? '?')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-xs leading-tight">{lead.contact?.name ?? 'Unknown'}</p>
                      <p className="text-gray-400 text-xs">{lead.contact?.phone}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${platformColor(lead.platform)}`}>
                    {lead.platform}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[180px]">
                  {lead.ad_headline
                    ? <p className="text-xs font-medium text-gray-800 truncate">{lead.ad_headline}</p>
                    : <span className="text-xs text-gray-400">—</span>}
                  {lead.ad_body && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{lead.ad_body}</p>
                  )}
                </td>
                <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                  <p className="text-xs text-gray-600 truncate">{lead.first_message ?? '—'}</p>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant="outline" className={`text-xs capitalize ${
                    lead.status === 'open' ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                    : lead.status === 'resolved' ? 'border-gray-200 text-gray-500'
                    : 'border-amber-200 text-amber-700 bg-amber-50'
                  }`}>
                    {lead.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, RefreshCw, Plus, Trash2, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';

interface KeywordRow {
  id: string;
  keyword: string;
  area: string | null;
  resolved: boolean;
  currentRank: number | null;
  found: boolean;
  previousRank: number | null;
  checkedOn: string | null;
  history: Array<{ date: string; rank: number | null; found: boolean }>;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Request failed'); return d; });

function RankBadge({ rank, found }: { rank: number | null; found: boolean }) {
  if (!found || rank === null) return <Badge variant="outline" className="text-xs border-gray-200 text-gray-400">Not in top 20</Badge>;
  const cls = rank <= 3 ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
    : rank <= 10 ? 'border-amber-200 text-amber-700 bg-amber-50'
    : 'border-gray-200 text-gray-600';
  return <Badge variant="outline" className={`text-xs font-semibold ${cls}`}>#{rank}</Badge>;
}

function Trend({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return <Minus className="h-3.5 w-3.5 text-gray-300" />;
  // Lower rank number is better.
  if (current < previous) return <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600"><TrendingUp className="h-3.5 w-3.5" />+{previous - current}</span>;
  if (current > previous) return <span className="inline-flex items-center gap-0.5 text-xs text-rose-600"><TrendingDown className="h-3.5 w-3.5" />-{current - previous}</span>;
  return <Minus className="h-3.5 w-3.5 text-gray-300" />;
}

interface Candidate { id: string; name: string; address: string; lat?: number; lng?: number }

// Which Google listing this workspace is measured against. It is a choice, not a
// lookup: searching "Umang Hospital Dwarka" returns a hospital of nearly the same
// name 20km away first, and one in Pune third, so taking the top hit produced
// confident rankings for somebody else's business.
function BusinessPicker({ workspaceId, onChosen }: { workspaceId?: string; onChosen: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data } = useQuery({
    queryKey: ['local-rank-business', workspaceId],
    queryFn: () => fetch(`/api/local-rank/business?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
  });
  const chosen: Candidate | null = data?.chosen ?? null;

  async function search() {
    if (!query.trim()) { toast.error('Type your business name'); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/local-rank/business?workspaceId=${workspaceId}&q=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Search failed');
      setCandidates(d.candidates ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
    } finally { setSearching(false); }
  }

  async function choose(place: Candidate) {
    try {
      await post('/api/local-rank/business', { workspaceId, place });
      toast.success(`Tracking ${place.name}`);
      setCandidates(null); setQuery(''); setEditing(false);
      void qc.invalidateQueries({ queryKey: ['local-rank-business', workspaceId] });
      onChosen();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  }

  if (chosen && !editing) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Tracking this listing</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{chosen.name}</p>
          <p className="text-xs text-gray-500">{chosen.address}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Change</Button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Which Google listing is yours?</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Ranks are measured against this listing, so pick it once and check the address carefully —
          several businesses often share a name.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Business name + area, e.g. Umang Hospital Dwarka"
          className="flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter' && !searching) { e.preventDefault(); void search(); } }}
        />
        <Button onClick={() => void search()} disabled={searching} className="bg-brand-500 hover:bg-brand-600 text-white shrink-0">
          {searching ? 'Searching…' : 'Search'}
        </Button>
        {chosen && <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>

      {candidates?.length === 0 && (
        <p className="text-xs text-gray-500">No listings found. Try the exact name shown on your Google Business Profile.</p>
      )}
      {!!candidates?.length && (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => void choose(c)}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">{c.name}</p>
              <p className="text-xs text-gray-500">{c.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LocalRankPage() {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const [keyword, setKeyword] = useState('');
  const [area, setArea] = useState('');
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['local-rank', workspaceId],
    queryFn: () => fetch(`/api/local-rank?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
  });

  const configured: boolean = data?.configured ?? true;
  const keywords: KeywordRow[] = data?.keywords ?? [];

  const { data: biz } = useQuery({
    queryKey: ['local-rank-business', workspaceId],
    queryFn: () => fetch(`/api/local-rank/business?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
  });
  const hasBusiness = Boolean(biz?.chosen?.id);

  async function addKeyword() {
    if (!keyword.trim()) { toast.error('Enter a keyword'); return; }
    setAdding(true);
    try {
      const d = await post('/api/local-rank/keywords', { workspaceId, keyword, area });
      toast.success(d.found ? `Added — currently ranked #${d.rank}` : 'Added — not in the top 20 yet');
      setKeyword(''); setArea('');
      void qc.invalidateQueries({ queryKey: ['local-rank', workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add keyword');
    } finally { setAdding(false); }
  }

  async function checkAll() {
    setChecking(true);
    try {
      const d = await post('/api/local-rank/check', { workspaceId });
      toast.success(`Checked ${d.checked ?? 0} keyword${d.checked === 1 ? '' : 's'}`);
      void qc.invalidateQueries({ queryKey: ['local-rank', workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check failed');
    } finally { setChecking(false); }
  }

  async function remove(id: string) {
    try {
      await fetch(`/api/local-rank/keywords?workspaceId=${workspaceId}&id=${id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['local-rank', workspaceId] });
    } catch { toast.error('Could not remove'); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-brand-500" /> Local Rank Tracker
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">See where you rank on Google for the searches your customers use</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void checkAll()} disabled={checking || keywords.length === 0}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checking ? 'animate-spin' : ''}`} /> Check all now
        </Button>
      </div>

      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">Google Places API key is not configured, so ranks can&apos;t be checked yet.</p>
        </div>
      )}

      <BusinessPicker
        workspaceId={workspaceId}
        onChosen={() => void qc.invalidateQueries({ queryKey: ['local-rank', workspaceId] })}
      />

      {/* Add keyword — only once there is a listing to measure against, since a
          keyword without one would record ranks for nothing. */}
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 ${hasBusiness ? '' : 'opacity-50 pointer-events-none'}`}>
        <p className="text-sm font-semibold text-gray-900">Track a new keyword</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. organic soap shop" className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter' && !adding) { e.preventDefault(); void addKeyword(); } }} />
          <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area / city (optional) e.g. Indore" className="flex-1 sm:max-w-[220px]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !adding) { e.preventDefault(); void addKeyword(); } }} />
          <Button onClick={() => void addKeyword()} disabled={adding} className="bg-brand-500 hover:bg-brand-600 text-white shrink-0">
            <Plus className="h-4 w-4 mr-1.5" /> {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
        <p className="text-[11px] text-gray-400">We search Google for this keyword near your area and record where your listing appears. Checked automatically each day.</p>
      </div>

      {/* Keyword list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-3 border-b border-gray-100 text-xs font-medium text-gray-400">
          <span>Keyword</span><span>Rank</span><span>Trend</span><span></span>
        </div>
        <div className="divide-y divide-gray-50">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="p-4"><Skeleton className="h-5 w-full" /></div>)}
          {!isLoading && keywords.length === 0 && <p className="p-8 text-center text-sm text-gray-400">No keywords tracked yet. Add one above.</p>}
          {!isLoading && keywords.map((k) => (
            <div key={k.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-3 items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{k.keyword}</p>
                <p className="text-xs text-gray-400 truncate">
                  {k.area ? `${k.area} · ` : ''}{k.checkedOn ? `checked ${new Date(k.checkedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'not checked yet'}
                  {!k.resolved && ' · listing not matched'}
                </p>
              </div>
              <RankBadge rank={k.currentRank} found={k.found} />
              <Trend current={k.currentRank} previous={k.previousRank} />
              <button onClick={() => void remove(k.id)} className="text-gray-300 hover:text-rose-500 transition-colors" title="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { useWorkspaceStore } from '@/store/workspace.store';
import { QUICK_RANGES, type QuickRange } from '@/lib/date-range';
import { LEAD_STAGES, STAGE_LABELS, type LeadStage } from '@/modules/crm/services/lead.service';

// Filters owned by this component (date range / campaign / temperature / stage /
// flag / assigned agent / label / sentiment / message search). Status + channel
// stay as tabs in ConversationList — they already had first-class UI there and
// this brief only asks these dimensions to move into the filter bar.
export interface ConversationAdvancedFilters {
  quick?: QuickRange | 'custom';
  from?: string;
  to?: string;
  campaign_id?: string;
  temperature?: string;
  stage?: string;
  flag?: string;
  assigned_agent_id?: string;
  label?: string;
  sentiment?: string;
  q?: string;
}

export const DEFAULT_ADVANCED_FILTERS: ConversationAdvancedFilters = {};

const TEMPERATURES = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
] as const;

const FLAGS = [
  { value: 'unread', label: 'Unread' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'replied', label: 'Replied' },
  { value: 'spam', label: 'Spam' },
] as const;

const SENTIMENTS = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
] as const;

interface CampaignOption { id: string; name: string; }
interface TeamMemberOption { id: string; user_id: string; full_name: string | null; email: string | null; }
interface WorkspaceLabelOption { id: string; name: string; color: string; }

function useCampaignOptions(workspaceId: string) {
  return useQuery<CampaignOption[]>({
    queryKey: ['conversation-filter-campaigns', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/list?workspaceId=${workspaceId}`);
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{ id: string; name: string }>;
      return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

function useAgentOptions(workspaceId: string) {
  return useQuery<TeamMemberOption[]>({
    queryKey: ['conversation-filter-agents', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/team/members?workspaceId=${workspaceId}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { members: TeamMemberOption[] };
      return data.members ?? [];
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

function useLabelOptions(workspaceId: string) {
  return useQuery<WorkspaceLabelOption[]>({
    queryKey: ['conversation-filter-labels', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/labels?workspaceId=${workspaceId}`);
      if (!res.ok) return [];
      return (await res.json()) as WorkspaceLabelOption[];
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

interface ConversationFiltersProps {
  value: ConversationAdvancedFilters;
  onChange: (next: ConversationAdvancedFilters) => void;
}

export function ConversationFilters({ value, onChange }: ConversationFiltersProps) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');
  const [searchInput, setSearchInput] = useState(value.q ?? '');
  const debouncedSearch = useDebounce(searchInput, 400);
  const [panelOpen, setPanelOpen] = useState(false);

  const { data: campaigns = [] } = useCampaignOptions(workspaceId);
  const { data: agents = [] } = useAgentOptions(workspaceId);
  const { data: labels = [] } = useLabelOptions(workspaceId);

  // Keep the box in sync when filters are reset elsewhere (e.g. a chip's × or "Clear all").
  useEffect(() => {
    setSearchInput(value.q ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.q]);

  useEffect(() => {
    if (debouncedSearch === (value.q ?? '')) return;
    onChange({ ...value, q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function set<K extends keyof ConversationAdvancedFilters>(key: K, val: ConversationAdvancedFilters[K]) {
    onChange({ ...value, [key]: val });
  }

  function remove(key: keyof ConversationAdvancedFilters) {
    const next = { ...value };
    delete next[key];
    if (key === 'quick') { delete next.from; delete next.to; }
    onChange(next);
  }

  function clearAll() {
    setSearchInput('');
    onChange({});
  }

  const activeCount = Object.values(value).filter((v) => v !== undefined && v !== '').length;

  const chips: Array<{ key: keyof ConversationAdvancedFilters; label: string }> = [];
  if (value.quick && value.quick !== 'custom') {
    chips.push({ key: 'quick', label: QUICK_RANGES.find((r) => r.key === value.quick)?.label ?? value.quick });
  } else if (value.quick === 'custom' && value.from && value.to) {
    chips.push({ key: 'quick', label: `${value.from} → ${value.to}` });
  }
  if (value.campaign_id) {
    chips.push({ key: 'campaign_id', label: campaigns.find((c) => c.id === value.campaign_id)?.name ?? 'Campaign' });
  }
  if (value.temperature) {
    chips.push({ key: 'temperature', label: TEMPERATURES.find((t) => t.value === value.temperature)?.label ?? value.temperature });
  }
  if (value.stage) {
    chips.push({ key: 'stage', label: STAGE_LABELS[value.stage as LeadStage] ?? value.stage });
  }
  if (value.flag) {
    chips.push({ key: 'flag', label: FLAGS.find((f) => f.value === value.flag)?.label ?? value.flag });
  }
  if (value.assigned_agent_id) {
    const agent = agents.find((a) => a.user_id === value.assigned_agent_id);
    chips.push({ key: 'assigned_agent_id', label: agent?.full_name ?? agent?.email ?? 'Agent' });
  }
  if (value.label) {
    chips.push({ key: 'label', label: value.label });
  }
  if (value.sentiment) {
    chips.push({ key: 'sentiment', label: SENTIMENTS.find((s) => s.value === value.sentiment)?.label ?? value.sentiment });
  }
  if (value.q) {
    chips.push({ key: 'q', label: `"${value.q}"` });
  }

  return (
    <div className="shrink-0 border-b border-border px-3 py-2 space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search messages…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Popover open={panelOpen} onOpenChange={setPanelOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={activeCount > 0 ? 'secondary' : 'outline'}
              size="icon"
              className="relative h-8 w-8 shrink-0"
              title="Filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold leading-none text-white">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-[75vh] w-72 space-y-3 overflow-y-auto p-3">
            {/* Date range */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Date range</label>
              <Select
                value={value.quick ?? 'any'}
                onValueChange={(v) => (v === 'any' ? remove('quick') : set('quick', v as QuickRange))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any time" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any time</SelectItem>
                  {QUICK_RANGES.map((r) => (
                    <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom range…</SelectItem>
                </SelectContent>
              </Select>
              {value.quick === 'custom' && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    type="date"
                    value={value.from ?? ''}
                    onChange={(e) => set('from', e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <input
                    type="date"
                    value={value.to ?? ''}
                    onChange={(e) => set('to', e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  />
                </div>
              )}
            </div>

            {/* Campaign */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Campaign</label>
              <Select
                value={value.campaign_id ?? 'any'}
                onValueChange={(v) => (v === 'any' ? remove('campaign_id') : set('campaign_id', v))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any campaign" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any campaign</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Temperature */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Lead temperature</label>
              <div className="flex gap-1">
                {TEMPERATURES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => (value.temperature === t.value ? remove('temperature') : set('temperature', t.value))}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                      value.temperature === t.value
                        ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Lead stage</label>
              <Select
                value={value.stage ?? 'any'}
                onValueChange={(v) => (v === 'any' ? remove('stage') : set('stage', v))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any stage</SelectItem>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Flags */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Flag</label>
              <div className="flex flex-wrap gap-1">
                {FLAGS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => (value.flag === f.value ? remove('flag') : set('flag', f.value))}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      value.flag === f.value
                        ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned agent */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Assigned agent</label>
              <Select
                value={value.assigned_agent_id ?? 'any'}
                onValueChange={(v) => (v === 'any' ? remove('assigned_agent_id') : set('assigned_agent_id', v))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any agent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any agent</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.full_name ?? a.email ?? a.user_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Label */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Label</label>
              <Select
                value={value.label ?? 'any'}
                onValueChange={(v) => (v === 'any' ? remove('label') : set('label', v))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any label" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any label</SelectItem>
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sentiment */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Sentiment</label>
              <Select
                value={value.sentiment ?? 'any'}
                onValueChange={(v) => (v === 'any' ? remove('sentiment') : set('sentiment', v))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any sentiment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any sentiment</SelectItem>
                  {SENTIMENTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={clearAll}>
                Clear all filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium"
            >
              {chip.label}
              <button
                onClick={() => {
                  if (chip.key === 'q') setSearchInput('');
                  remove(chip.key);
                }}
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
          <button onClick={clearAll} className="text-[10px] font-medium text-brand-600 hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

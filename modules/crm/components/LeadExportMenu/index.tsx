'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ChevronDown } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';
import { LEAD_STAGES, STAGE_LABELS } from '../../services/lead.service';

const TEMPS = [
  { key: 'all',  label: 'All Leads' },
  { key: 'hot',  label: '🔥 Hot leads' },
  { key: 'warm', label: '🌤️ Warm leads' },
  { key: 'cold', label: '❄️ Cold leads' },
];

interface TeamMemberOption { user_id: string; full_name: string | null; email: string | null; }

function useAgentOptions(workspaceId: string) {
  return useQuery<TeamMemberOption[]>({
    queryKey: ['lead-export-agents', workspaceId],
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

/** Bulk lead export dropdown — All / Hot / Warm / Cold in Excel or CSV, with
 *  optional stage / assigned-agent / date-range filters (passed through to
 *  /api/leads/export, which already accepts them server-side). */
export function LeadExportMenu({ compact = false }: { compact?: boolean }) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [stage, setStage] = useState('');
  const [assignedAgent, setAssignedAgent] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: agents = [] } = useAgentOptions(workspaceId);

  const download = (temperature: string) => {
    if (!workspaceId) { toast.error('No workspace selected'); return; }
    const p = new URLSearchParams({ workspaceId, format, temperature });
    if (stage) p.set('stage', stage);
    if (assignedAgent) p.set('assigned_agent', assignedAgent);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    window.open(`/api/leads/export?${p}`, '_blank');
    toast.success(`Exporting ${temperature === 'all' ? 'all' : temperature} leads (${format.toUpperCase()})…`);
    setOpen(false);
  };

  return (
    <div className="relative">
      {compact ? (
        <button
          onClick={() => setOpen((o) => !o)}
          title="Export leads (all / hot / warm / cold)"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" /> Leads
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Download className="h-4 w-4" /> Export Leads <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-lg">
            <div className="flex items-center gap-1 p-1.5">
              {(['xlsx', 'csv'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    format === f ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'xlsx' ? 'Excel' : 'CSV'}
                </button>
              ))}
            </div>
            <div className="my-1 h-px bg-border" />

            {/* Optional filters — narrow the exported set before picking a temperature below */}
            <div className="space-y-1.5 p-1.5">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="">Any stage</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
              <select
                value={assignedAgent}
                onChange={(e) => setAssignedAgent(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="">Any agent</option>
                {agents.map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.full_name ?? a.email ?? a.user_id}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  aria-label="From date"
                />
                <span className="text-[10px] text-muted-foreground">–</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  aria-label="To date"
                />
              </div>
            </div>
            <div className="my-1 h-px bg-border" />

            {TEMPS.map((t) => (
              <button
                key={t.key}
                onClick={() => download(t.key)}
                className="flex w-full items-center rounded px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

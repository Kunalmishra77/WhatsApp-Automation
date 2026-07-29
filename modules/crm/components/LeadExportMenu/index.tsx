'use client';

import { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';

const TEMPS = [
  { key: 'all',  label: 'All Leads' },
  { key: 'hot',  label: '🔥 Hot leads' },
  { key: 'warm', label: '🌤️ Warm leads' },
  { key: 'cold', label: '❄️ Cold leads' },
];

/** Bulk lead export dropdown — All / Hot / Warm / Cold in Excel or CSV. */
export function LeadExportMenu({ compact = false }: { compact?: boolean }) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');

  const download = (temperature: string) => {
    if (!workspaceId) { toast.error('No workspace selected'); return; }
    window.open(`/api/leads/export?workspaceId=${workspaceId}&format=${format}&temperature=${temperature}`, '_blank');
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
          <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-border bg-card p-1 shadow-lg">
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

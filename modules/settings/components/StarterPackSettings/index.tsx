'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { VERTICALS } from '@/lib/verticals';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function StarterPackSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [selected, setSelected] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function apply() {
    if (!selected) { toast.error('Pick your industry first'); return; }
    setApplying(true);
    try {
      const res = await fetch('/api/workspace/apply-starter-pack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, vertical: selected }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to apply');
      setDone(selected);
      toast.success(
        `Starter pack applied — ${d.quickRepliesAdded} quick replies added` +
        (d.personaSet ? ' + AI persona set' : ' (persona kept as-is)'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply');
    } finally { setApplying(false); }
  }

  const chosen = VERTICALS.find((v) => v.key === selected);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-brand-500" /> Industry Starter Pack
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pick your industry to instantly set up a tailored AI persona, quick replies and campaign ideas.
          (Your existing persona is never overwritten.)
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {VERTICALS.map((v) => (
          <button
            key={v.key}
            onClick={() => setSelected(v.key)}
            className={cn(
              'rounded-xl border p-3 text-left transition-all',
              selected === v.key ? 'border-brand-400 ring-2 ring-brand-400/40 bg-brand-50' : 'border-border hover:border-brand-300',
            )}
          >
            <div className="text-xl">{v.emoji}</div>
            <p className="mt-1 text-sm font-medium text-foreground">{v.label}</p>
            {done === v.key && <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check className="h-3 w-3" /> Applied</span>}
          </button>
        ))}
      </div>

      {chosen && (
        <div className="rounded-xl border border-border p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What gets added</p>
          <p className="text-sm text-foreground">✅ {chosen.quickReplies.length} quick replies ({chosen.quickReplies.map((q) => q.shortcut).join(', ')})</p>
          <p className="text-sm text-foreground">✅ A tailored AI persona (only if you don&apos;t have one yet)</p>
          <p className="text-sm text-foreground">💡 Campaign ideas: {chosen.campaignIdeas.join(' · ')}</p>
        </div>
      )}

      <Button onClick={() => void apply()} disabled={!selected || applying} className="gap-1.5">
        {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {applying ? 'Applying…' : 'Apply starter pack'}
      </Button>
    </div>
  );
}

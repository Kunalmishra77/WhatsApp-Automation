'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2 as Spin, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Variant { title: string; body: string }

interface AiCopyButtonProps {
  workspaceId: string;
  /** Prefilled goal hint, e.g. the campaign name. */
  goalHint?: string;
  /** Called when the user picks a variant to insert into the message field. */
  onInsert: (text: string) => void;
}

// Inline "write with AI" helper for campaign copy. Asks for a one-line goal,
// calls /api/campaigns/generate-copy, and lets the user click a variant to
// drop it straight into the message box.
export function AiCopyButton({ workspaceId, goalHint, onInsert }: AiCopyButtonProps) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);

  async function generate() {
    const g = (goal.trim() || goalHint?.trim() || '').trim();
    if (!g) {
      toast.error('Tell the AI what the campaign is about');
      return;
    }
    if (!workspaceId) {
      toast.error('No active workspace');
      return;
    }
    setLoading(true);
    setVariants([]);
    try {
      const res = await fetch('/api/campaigns/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, goal: g }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? 'Generation failed');
        return;
      }
      setVariants((data.variants ?? []) as Variant[]);
      if (!data.variants?.length) toast.error('No copy returned — try rephrasing');
    } catch {
      toast.error('Could not reach the AI');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        <Sparkles className="h-3.5 w-3.5" /> Write with AI
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-brand-600" />
        <p className="text-xs font-semibold text-brand-800">Write with AI</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="flex gap-1.5">
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) { e.preventDefault(); void generate(); } }}
          placeholder={goalHint ? `e.g. ${goalHint}` : 'e.g. 20% off on all products this weekend'}
          className="h-8 text-xs"
        />
        <Button type="button" size="sm" onClick={() => void generate()} disabled={loading} className="h-8 shrink-0">
          {loading ? <Spin className="h-3.5 w-3.5 animate-spin" /> : 'Generate'}
        </Button>
      </div>

      {variants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-brand-700">Tap a version to use it:</p>
          {variants.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onInsert(v.body); setOpen(false); toast.success('Copy added'); }}
              className="w-full text-left rounded-md border border-border bg-background p-2 hover:border-brand-400 transition-colors group"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{v.title}</span>
                <Check className="h-3 w-3 text-brand-500 ml-auto opacity-0 group-hover:opacity-100" />
              </div>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-6">{v.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

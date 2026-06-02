'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tag, Check, X } from 'lucide-react';

export const LABEL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  gray:   { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  green:  { bg: 'bg-emerald-100',text: 'text-emerald-700',dot: 'bg-emerald-500'},
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  pink:   { bg: 'bg-pink-100',   text: 'text-pink-700',   dot: 'bg-pink-500'   },
};

interface WorkspaceLabel { id: string; name: string; color: string; }

function useLabelData() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  return useQuery<WorkspaceLabel[]>({
    queryKey: ['workspace-labels', workspaceId],
    queryFn:  () => fetch(`/api/labels?workspaceId=${workspaceId}`).then((r) => r.json() as Promise<WorkspaceLabel[]>),
    enabled:  !!workspaceId,
    staleTime: 60_000,
  });
}

function useSetLabels(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (labels: string[]) =>
      fetch(`/api/conversations/${conversationId}/labels`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ labels }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// ── Label badge (display) ──────────────────────────────────────────────────────
export function LabelBadge({ label, color, onRemove }: { label: string; color?: string; onRemove?: () => void }) {
  const c = LABEL_COLORS[color ?? 'gray'] ?? LABEL_COLORS['gray']!;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', c.bg, c.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {label}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

// ── Label picker popover ───────────────────────────────────────────────────────
interface LabelPickerProps {
  conversationId: string;
  currentLabels: string[];
}

export function LabelPicker({ conversationId, currentLabels }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: allLabels = [] } = useLabelData();
  const setLabels = useSetLabels(conversationId);

  const toggle = (name: string) => {
    const next = currentLabels.includes(name)
      ? currentLabels.filter((l) => l !== name)
      : [...currentLabels, name];
    void setLabels.mutate(next);
  };

  const getLabelColor = (name: string) =>
    allLabels.find((l) => l.name === name)?.color ?? 'gray';

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Current labels as badges */}
      {currentLabels.map((lbl) => (
        <LabelBadge
          key={lbl}
          label={lbl}
          color={getLabelColor(lbl)}
          onRemove={() => toggle(lbl)}
        />
      ))}

      {/* Picker trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Add label">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">Labels</p>
          {allLabels.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2">No labels yet. Create them in Settings → Automation → Labels.</p>
          ) : (
            <div className="space-y-0.5">
              {allLabels.map((lbl) => {
                const active = currentLabels.includes(lbl.name);
                const c = LABEL_COLORS[lbl.color] ?? LABEL_COLORS['gray']!;
                return (
                  <button
                    key={lbl.id}
                    onClick={() => toggle(lbl.name)}
                    className={cn('flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors', active ? 'bg-accent' : 'hover:bg-accent')}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', c.dot)} />
                    <span className="flex-1 text-left">{lbl.name}</span>
                    {active && <Check className="h-3 w-3 text-brand-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LABEL_COLORS } from '@/modules/conversations/components/LabelPicker';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WorkspaceLabel { id: string; name: string; color: string; }

const COLOR_OPTIONS = Object.keys(LABEL_COLORS) as Array<keyof typeof LABEL_COLORS>;

export function LabelSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient  = useQueryClient();
  const [name, setName]   = useState('');
  const [color, setColor] = useState('gray');

  const { data: labels = [], isLoading } = useQuery<WorkspaceLabel[]>({
    queryKey: ['workspace-labels', workspaceId],
    queryFn:  () => fetch(`/api/labels?workspaceId=${workspaceId}`).then((r) => r.json() as Promise<WorkspaceLabel[]>),
    enabled:  !!workspaceId,
  });

  const create = useMutation({
    mutationFn: () => fetch('/api/labels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, name: name.trim(), color }),
    }).then((r) => r.json()),
    onSuccess: (data: { error?: string }) => {
      if (data.error) { toast.error(data.error); return; }
      void queryClient.invalidateQueries({ queryKey: ['workspace-labels', workspaceId] });
      setName('');
      toast.success('Label created');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetch(`/api/labels?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-labels', workspaceId] });
      toast.success('Label deleted');
    },
  });

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Conversation Labels</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Create labels to categorize conversations (Sales, Support, Billing, etc.)</p>
      </div>

      {/* Create new */}
      <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
        <p className="text-sm font-medium">New Label</p>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales, Support, Urgent"
            maxLength={50}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void create.mutate(); }}
          />
          <Button onClick={() => void create.mutate()} disabled={!name.trim() || create.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {/* Color picker */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Color:</span>
          {COLOR_OPTIONS.map((c) => {
            const col = LABEL_COLORS[c]!;
            return (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn('h-6 w-6 rounded-full transition-all', col.dot, color === c && 'ring-2 ring-offset-2 ring-brand-500')}
                title={c}
              />
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Preview: <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ml-1', LABEL_COLORS[color as keyof typeof LABEL_COLORS]?.bg, LABEL_COLORS[color as keyof typeof LABEL_COLORS]?.text)}><span className={cn('h-1.5 w-1.5 rounded-full', LABEL_COLORS[color as keyof typeof LABEL_COLORS]?.dot)} />{name || 'Label'}</span></p>
      </div>

      {/* Existing labels */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{labels.length} label{labels.length !== 1 ? 's' : ''}</p>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : labels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No labels yet. Create your first label above.
          </div>
        ) : (
          labels.map((lbl) => {
            const c = LABEL_COLORS[lbl.color as keyof typeof LABEL_COLORS] ?? LABEL_COLORS['gray']!;
            return (
              <div key={lbl.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', c.bg, c.text)}>
                  <span className={cn('h-2 w-2 rounded-full', c.dot)} />
                  {lbl.name}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void remove.mutate(lbl.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

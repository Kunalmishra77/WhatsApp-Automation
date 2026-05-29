# Agentix Phase 7 — CRM Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CRM Kanban pipeline — six stage columns (`new → contacted → follow_up → interested → converted → lost`), drag-and-drop lead cards via `@dnd-kit`, a lead creation modal, and a slide-in lead detail drawer.

**Architecture:** `modules/crm/services/lead.service.ts` handles Supabase CRUD. `modules/crm/hooks/useLeads.ts` wraps with TanStack Query grouped by stage. The Kanban board uses `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop; on `DragEnd` the hook fires an optimistic update then calls `updateLeadStage`. The detail drawer is a shadcn `<Sheet>`.

**Tech Stack:** Next.js 15, Supabase client, TanStack Query v5, `@dnd-kit/core` + `@dnd-kit/sortable`, shadcn/ui (Sheet, Dialog, Badge, Avatar, ScrollArea, Skeleton, Select), react-hook-form + zod, lucide-react, date-fns.

---

## File Map

### New files
```
modules/crm/services/lead.service.ts           — Supabase CRUD for leads
modules/crm/hooks/useLeads.ts                  — TanStack Query grouped by stage
modules/crm/components/KanbanBoard/index.tsx   — dnd-kit DndContext wrapper
modules/crm/components/KanbanColumn/index.tsx  — droppable column per stage
modules/crm/components/LeadCard/index.tsx      — draggable lead card
modules/crm/components/LeadDetail/index.tsx    — sheet drawer with full lead info
modules/crm/components/LeadForm/index.tsx      — create/edit lead modal
```

### Modified files
```
app/(dashboard)/crm/page.tsx   — wire KanbanBoard
```

---

## Task 1: Lead Service

**Files:**
- Create: `d:\WhatsApp-Automation\modules\crm\services\lead.service.ts`

- [ ] **Step 1: Write lead service**

Write `d:\WhatsApp-Automation\modules\crm\services\lead.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type LeadRow = Database['public']['Tables']['leads']['Row'];
export type LeadStage = Database['public']['Tables']['leads']['Row']['stage'];
export type LeadInsert = Database['public']['Tables']['leads']['Insert'];
export type LeadUpdate = Database['public']['Tables']['leads']['Update'];

export const LEAD_STAGES: LeadStage[] = [
  'new', 'contacted', 'follow_up', 'interested', 'converted', 'lost',
];

export const STAGE_LABELS: Record<LeadStage, string> = {
  new:        'New',
  contacted:  'Contacted',
  follow_up:  'Follow Up',
  interested: 'Interested',
  converted:  'Converted',
  lost:       'Lost',
};

export const STAGE_COLORS: Record<LeadStage, string> = {
  new:        'bg-gray-100 text-gray-700',
  contacted:  'bg-brand-100 text-brand-700',
  follow_up:  'bg-amber-100 text-amber-700',
  interested: 'bg-violet-100 text-violet-700',
  converted:  'bg-emerald-100 text-emerald-700',
  lost:       'bg-red-100 text-red-700',
};

export type LeadWithContact = LeadRow & {
  contacts: { name: string | null; phone: string; avatar_url: string | null } | null;
};

export async function fetchLeadsByStage(
  workspaceId: string,
): Promise<Record<LeadStage, LeadWithContact[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*, contacts(name, phone, avatar_url)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const grouped = Object.fromEntries(
    LEAD_STAGES.map((s) => [s, []]),
  ) as Record<LeadStage, LeadWithContact[]>;

  for (const lead of (data ?? []) as LeadWithContact[]) {
    grouped[lead.stage].push(lead);
  }
  return grouped;
}

export async function createLead(
  workspaceId: string,
  payload: Omit<LeadInsert, 'workspace_id'>,
): Promise<LeadRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...payload, workspace_id: workspaceId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLead(id: string, payload: LeadUpdate): Promise<LeadRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLeadStage(id: string, stage: LeadStage): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/crm/services/lead.service.ts
git commit -m "feat(crm): add lead service (fetch by stage, CRUD, stage update)"
```

---

## Task 2: useLeads Hook

**Files:**
- Create: `d:\WhatsApp-Automation\modules\crm\hooks\useLeads.ts`

- [ ] **Step 1: Write hook**

Write `d:\WhatsApp-Automation\modules\crm\hooks\useLeads.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLeadsByStage, createLead, updateLead, updateLeadStage, deleteLead,
} from '../services/lead.service';
import type { LeadInsert, LeadStage, LeadUpdate, LeadWithContact } from '../services/lead.service';
import { LEAD_STAGES } from '../services/lead.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useLeads() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['leads', workspaceId],
    queryFn: () => fetchLeadsByStage(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (payload: Omit<LeadInsert, 'workspace_id'>) =>
      createLead(workspaceId!, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LeadUpdate }) =>
      updateLead(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}

export function useMoveLeadStage() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) =>
      updateLeadStage(id, stage),

    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['leads', workspaceId] });
      const previous = queryClient.getQueryData<Record<LeadStage, LeadWithContact[]>>(['leads', workspaceId]);

      // Optimistic update: move lead to new stage
      queryClient.setQueryData<Record<LeadStage, LeadWithContact[]>>(
        ['leads', workspaceId],
        (old) => {
          if (!old) return old;
          const next = { ...old };
          let moved: LeadWithContact | undefined;
          for (const s of LEAD_STAGES) {
            const idx = next[s].findIndex((l) => l.id === id);
            if (idx !== -1) {
              moved = { ...next[s][idx], stage };
              next[s] = next[s].filter((l) => l.id !== id);
              break;
            }
          }
          if (moved) next[stage] = [moved, ...next[stage]];
          return next;
        },
      );
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['leads', workspaceId], context.previous);
      }
    },

    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] }),
  });
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/crm/hooks/useLeads.ts
git commit -m "feat(crm): add useLeads hooks with optimistic stage move"
```

---

## Task 3: LeadForm Modal

**Files:**
- Create: `d:\WhatsApp-Automation\modules\crm\components\LeadForm\index.tsx`

- [ ] **Step 1: Write LeadForm**

Write `d:\WhatsApp-Automation\modules\crm\components\LeadForm\index.tsx`:

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateLead, useUpdateLead } from '../../hooks/useLeads';
import { LEAD_STAGES, STAGE_LABELS } from '../../services/lead.service';
import type { LeadRow } from '../../services/lead.service';
import { toast } from 'sonner';

const schema = z.object({
  title:    z.string().min(1, 'Title is required').max(255),
  stage:    z.enum(['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost']),
  value:    z.coerce.number().nonnegative().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  source:   z.string().max(100).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  lead?: LeadRow;
  defaultStage?: string;
}

export function LeadForm({ open, onClose, lead, defaultStage }: LeadFormProps) {
  const isEdit = !!lead;
  const create = useCreateLead();
  const update = useUpdateLead();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        title:    lead?.title ?? '',
        stage:    (lead?.stage ?? defaultStage ?? 'new') as FormValues['stage'],
        value:    lead?.value ?? undefined,
        priority: (lead?.priority ?? 'medium') as FormValues['priority'],
        source:   lead?.source ?? '',
      },
    });

  const stageValue = watch('stage');
  const priorityValue = watch('priority');

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && lead) {
        await update.mutateAsync({ id: lead.id, payload: values });
        toast.success('Lead updated');
      } else {
        await create.mutateAsync({ ...values, tags: [] });
        toast.success('Lead created');
      }
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save lead');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Lead' : 'New Lead'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Lead Title</Label>
            <Input id="title" {...register('title')} placeholder="Enterprise deal - Acme Inc." />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stageValue} onValueChange={(v) => setValue('stage', v as FormValues['stage'])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priorityValue} onValueChange={(v) => setValue('priority', v as FormValues['priority'])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="value">Deal Value ($)</Label>
              <Input id="value" type="number" min="0" {...register('value')} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Input id="source" {...register('source')} placeholder="Website, referral…" />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/crm/components/LeadForm/
git commit -m "feat(crm): add LeadForm modal (create/edit, stage/priority/value)"
```

---

## Task 4: LeadCard Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\crm\components\LeadCard\index.tsx`

- [ ] **Step 1: Write LeadCard**

Write `d:\WhatsApp-Automation\modules\crm\components\LeadCard\index.tsx`:

```typescript
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DollarSign, AlertCircle } from 'lucide-react';
import type { LeadWithContact } from '../../services/lead.service';

interface LeadCardProps {
  lead: LeadWithContact;
  onClick: () => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  high:   'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low:    'text-gray-500 bg-gray-50 border-gray-200',
};

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const contactName = lead.contacts?.name ?? lead.contacts?.phone ?? 'Unknown Contact';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing',
        'hover:border-brand-300 hover:shadow-md transition-all',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-brand-500',
      )}
      onClick={onClick}
    >
      <p className="text-sm font-medium text-foreground leading-snug mb-1.5 line-clamp-2">
        {lead.title}
      </p>

      {lead.contacts && (
        <p className="text-xs text-muted-foreground mb-2">{contactName}</p>
      )}

      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {lead.priority !== 'medium' && (
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                PRIORITY_STYLES[lead.priority] ?? PRIORITY_STYLES.medium,
              )}
            >
              {lead.priority}
            </span>
          )}
          {lead.source && (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">{lead.source}</Badge>
          )}
        </div>
        {lead.value != null && lead.value > 0 && (
          <div className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600">
            <DollarSign className="h-3 w-3" />
            {lead.value.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/crm/components/LeadCard/
git commit -m "feat(crm): add draggable LeadCard with priority, value, and contact name"
```

---

## Task 5: KanbanColumn Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\crm\components\KanbanColumn\index.tsx`

- [ ] **Step 1: Write KanbanColumn**

Write `d:\WhatsApp-Automation\modules\crm\components\KanbanColumn\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadCard } from '../LeadCard';
import { LeadForm } from '../LeadForm';
import type { LeadStage, LeadWithContact } from '../../services/lead.service';
import { STAGE_LABELS, STAGE_COLORS } from '../../services/lead.service';

interface KanbanColumnProps {
  stage: LeadStage;
  leads: LeadWithContact[];
  onLeadClick: (id: string) => void;
}

export function KanbanColumn({ stage, leads, onLeadClick }: KanbanColumnProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const { isOver, setNodeRef } = useDroppable({ id: stage });

  const totalValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

  return (
    <div className="flex w-72 shrink-0 flex-col">
      {/* Column header */}
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
              STAGE_COLORS[stage],
            )}
          >
            {STAGE_LABELS[stage]}
          </span>
          <Badge variant="outline" className="h-5 text-[11px] px-1.5">
            {leads.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {totalValue > 0 && (
            <span className="text-[11px] text-emerald-600 font-medium">
              ${totalValue.toLocaleString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 rounded-b-lg border border-t-0 border-border bg-muted/30 p-2 min-h-24 transition-colors',
          isOver && 'bg-brand-500/5 border-brand-300',
        )}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead.id)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <p className="pt-4 text-center text-xs text-muted-foreground">Drop leads here</p>
        )}
      </div>

      <LeadForm open={createOpen} onClose={() => setCreateOpen(false)} defaultStage={stage} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/crm/components/KanbanColumn/
git commit -m "feat(crm): add droppable KanbanColumn with header, value total, and add button"
```

---

## Task 6: LeadDetail Drawer

**Files:**
- Create: `d:\WhatsApp-Automation\modules\crm\components\LeadDetail\index.tsx`

- [ ] **Step 1: Write LeadDetail**

Write `d:\WhatsApp-Automation\modules\crm\components\LeadDetail\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/services/supabase/client';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Pencil, Trash2, DollarSign, User, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { useDeleteLead } from '../../hooks/useLeads';
import { LeadForm } from '../LeadForm';
import type { LeadRow } from '../../services/lead.service';
import { STAGE_LABELS, STAGE_COLORS } from '../../services/lead.service';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

async function fetchLead(id: string): Promise<(LeadRow & { contacts: { name: string | null; phone: string } | null }) | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('leads')
    .select('*, contacts(name, phone)')
    .eq('id', id)
    .single();
  return data;
}

interface LeadDetailProps {
  leadId: string | null;
  onClose: () => void;
}

export function LeadDetail({ leadId, onClose }: LeadDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeleteLead();

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLead(leadId!),
    enabled: !!leadId,
  });

  const handleDelete = async () => {
    if (!lead || !confirm(`Delete "${lead.title}"?`)) return;
    await remove.mutateAsync(lead.id);
    toast.success('Lead deleted');
    onClose();
  };

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-96 sm:max-w-96">
        {lead ? (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-start justify-between gap-2">
                <SheetTitle className="text-base leading-snug">{lead.title}</SheetTitle>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                    STAGE_COLORS[lead.stage],
                  )}
                >
                  {STAGE_LABELS[lead.stage]}
                </span>
              </div>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto">
              {/* Value + Priority */}
              <div className="grid grid-cols-2 gap-3">
                {lead.value != null && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-[11px] text-muted-foreground">Deal Value</p>
                    <p className="mt-0.5 flex items-center gap-0.5 text-lg font-semibold text-emerald-600">
                      <DollarSign className="h-4 w-4" />{lead.value.toLocaleString()}
                    </p>
                  </div>
                )}
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Priority</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize">{lead.priority}</p>
                </div>
              </div>

              {/* Contact */}
              {lead.contacts && (
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100">
                    <User className="h-4 w-4 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {lead.contacts.name ?? lead.contacts.phone}
                    </p>
                    {lead.contacts.name && (
                      <p className="text-xs text-muted-foreground">{lead.contacts.phone}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Meta */}
              <div className="space-y-2 text-sm">
                {lead.source && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Source</span>
                    <span className="font-medium">{lead.source}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{format(new Date(lead.created_at), 'MMM d, yyyy')}</span>
                </div>
                {lead.follow_up_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Follow Up</span>
                    <span className="font-medium text-amber-600">
                      {format(new Date(lead.follow_up_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>

              {lead.tags.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {lead.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="gap-1 text-xs">
                          <Tag className="h-2.5 w-2.5" />{tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {lead.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Notes</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</p>
                  </div>
                </>
              )}

              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>

            <LeadForm open={editOpen} onClose={() => setEditOpen(false)} lead={lead} />
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/crm/components/LeadDetail/
git commit -m "feat(crm): add LeadDetail sheet drawer (view, edit, delete)"
```

---

## Task 7: KanbanBoard + CRM Page

**Files:**
- Create: `d:\WhatsApp-Automation\modules\crm\components\KanbanBoard\index.tsx`
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\crm\page.tsx`

- [ ] **Step 1: Write KanbanBoard**

Write `d:\WhatsApp-Automation\modules\crm\components\KanbanBoard\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { KanbanColumn } from '../KanbanColumn';
import { LeadCard } from '../LeadCard';
import { LeadDetail } from '../LeadDetail';
import { LeadForm } from '../LeadForm';
import { useLeads, useMoveLeadStage } from '../../hooks/useLeads';
import { LEAD_STAGES } from '../../services/lead.service';
import type { LeadStage, LeadWithContact } from '../../services/lead.service';

export function KanbanBoard() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [dragging, setDragging] = useState<LeadWithContact | null>(null);
  const { data: pipeline, isLoading } = useLeads();
  const moveStage = useMoveLeadStage();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = (event: { active: { id: string } }) => {
    if (!pipeline) return;
    for (const stage of LEAD_STAGES) {
      const found = pipeline[stage].find((l) => l.id === event.active.id);
      if (found) { setDragging(found); break; }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over || !pipeline) return;

    const targetStage = over.id as LeadStage;
    if (!LEAD_STAGES.includes(targetStage)) return;

    // Find current stage
    for (const stage of LEAD_STAGES) {
      if (pipeline[stage].some((l) => l.id === active.id)) {
        if (stage !== targetStage) {
          moveStage.mutate({ id: active.id as string, stage: targetStage });
        }
        break;
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 p-6 overflow-x-auto">
        {LEAD_STAGES.map((s) => (
          <div key={s} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
          <h1 className="text-base font-semibold text-foreground">CRM Pipeline</h1>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Lead
          </Button>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart as (e: { active: { id: string } }) => void}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 p-6 h-full">
              {LEAD_STAGES.map((stage) => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  leads={pipeline?.[stage] ?? []}
                  onLeadClick={setSelectedLeadId}
                />
              ))}
            </div>

            <DragOverlay>
              {dragging && (
                <LeadCard lead={dragging} onClick={() => {}} />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      <LeadDetail leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      <LeadForm open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
```

- [ ] **Step 2: Write CRM page**

Write `d:\WhatsApp-Automation\app\(dashboard)\crm\page.tsx`:

```typescript
import { KanbanBoard } from '@/modules/crm/components/KanbanBoard';

export default function CrmPage() {
  return <KanbanBoard />;
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/crm/components/KanbanBoard/ "app/(dashboard)/crm/page.tsx"
git commit -m "feat(crm): compose KanbanBoard with DnD, drag overlay, lead detail sheet"
```

---

## Task 8: Build Verification

- [ ] **Step 1: TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: Zero errors.

- [ ] **Step 2: Production build**

```powershell
cd "d:\WhatsApp-Automation"; npm run build 2>&1 | Select-Object -Last 15
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Final commit**

```powershell
cd "d:\WhatsApp-Automation"
git add -A
git commit -m "feat: Phase 7 complete — CRM Pipeline Kanban (6 stages, DnD, optimistic updates)"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| Kanban pipeline with 6 stages | ✅ | Tasks 5, 7 |
| Drag-and-drop stage transitions | ✅ | Tasks 4, 7 |
| Optimistic UI on drag | ✅ | Task 2 |
| Lead cards with value, priority, contact | ✅ | Task 4 |
| Create lead modal | ✅ | Task 3 |
| Edit lead modal | ✅ | Tasks 3, 6 |
| Delete lead | ✅ | Task 6 |
| Lead detail drawer | ✅ | Task 6 |
| Stage totals (deal value) | ✅ | Task 5 |
| Column count badges | ✅ | Task 5 |

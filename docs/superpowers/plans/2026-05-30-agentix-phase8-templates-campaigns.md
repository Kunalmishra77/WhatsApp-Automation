# Agentix Phase 8 — Templates + Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build (A) the Template Manager — a list view with a create/edit form and live WhatsApp-style phone preview; and (B) the Campaign Builder — a 5-step wizard (name → template → audience → schedule → review) with a campaign list showing real-time delivery stats.

**Architecture:** Templates and campaigns each get their own service + hooks + page. The campaign wizard is a single Client Component that tracks `currentStep` in local state. Both modules sit under `modules/templates/` and `modules/campaigns/`. The `app/(dashboard)/templates/page.tsx` and `app/(dashboard)/campaigns/page.tsx` import the module root components.

**Tech Stack:** Next.js 15, Supabase client, TanStack Query v5, shadcn/ui (Dialog, Sheet, Select, Badge, Table, Progress, Tabs, Separator, Textarea, ScrollArea, Skeleton), react-hook-form + zod, date-fns, lucide-react.

---

## File Map

### New files — Templates
```
modules/templates/services/template.service.ts    — Supabase CRUD
modules/templates/hooks/useTemplates.ts           — TanStack Query
modules/templates/components/TemplateList/index.tsx     — table with status badges
modules/templates/components/TemplateForm/index.tsx     — create/edit form
modules/templates/components/WhatsAppPreview/index.tsx  — phone frame preview
```

### New files — Campaigns
```
modules/campaigns/services/campaign.service.ts   — Supabase CRUD
modules/campaigns/hooks/useCampaigns.ts          — TanStack Query
modules/campaigns/components/CampaignList/index.tsx      — table with stats + status
modules/campaigns/components/CampaignWizard/index.tsx    — 5-step builder
```

### Modified files
```
app/(dashboard)/templates/page.tsx   — wire TemplateList
app/(dashboard)/campaigns/page.tsx   — wire CampaignList + wizard
```

---

## Task 1: Template Service + Hook

**Files:**
- Create: `d:\WhatsApp-Automation\modules\templates\services\template.service.ts`
- Create: `d:\WhatsApp-Automation\modules\templates\hooks\useTemplates.ts`

- [ ] **Step 1: Write template service**

Write `d:\WhatsApp-Automation\modules\templates\services\template.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type TemplateRow = Database['public']['Tables']['templates']['Row'];
export type TemplateInsert = Database['public']['Tables']['templates']['Insert'];
export type TemplateUpdate = Database['public']['Tables']['templates']['Update'];

export const TEMPLATE_STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  paused:   'bg-gray-100 text-gray-600',
};

export const CATEGORY_LABELS: Record<string, string> = {
  authentication: 'Authentication',
  marketing:      'Marketing',
  utility:        'Utility',
};

export async function fetchTemplates(workspaceId: string): Promise<TemplateRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTemplate(
  workspaceId: string,
  payload: Omit<TemplateInsert, 'workspace_id'>,
): Promise<TemplateRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('templates')
    .insert({ ...payload, workspace_id: workspaceId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplate(id: string, payload: TemplateUpdate): Promise<TemplateRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('templates')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}

export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
  return [...new Set(matches)];
}
```

- [ ] **Step 2: Write template hook**

Write `d:\WhatsApp-Automation\modules\templates\hooks\useTemplates.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTemplates, createTemplate, updateTemplate, deleteTemplate,
} from '../services/template.service';
import type { TemplateInsert, TemplateUpdate } from '../services/template.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useTemplates() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['templates', workspaceId],
    queryFn: () => fetchTemplates(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (p: Omit<TemplateInsert, 'workspace_id'>) => createTemplate(workspaceId!, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TemplateUpdate }) => updateTemplate(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }),
  });
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/templates/services/template.service.ts modules/templates/hooks/useTemplates.ts
git commit -m "feat(templates): add template service and hooks (CRUD, variable extraction)"
```

---

## Task 2: WhatsAppPreview Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\templates\components\WhatsAppPreview\index.tsx`

- [ ] **Step 1: Write WhatsAppPreview**

Write `d:\WhatsApp-Automation\modules\templates\components\WhatsAppPreview\index.tsx`:

```typescript
interface WhatsAppPreviewProps {
  header?: string;
  body: string;
  footer?: string;
  buttons?: Array<{ type: string; text: string }>;
}

export function WhatsAppPreview({ header, body, footer, buttons }: WhatsAppPreviewProps) {
  // Replace {{1}}, {{2}} etc. with placeholder values
  const renderText = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (_, n) => `[Variable ${n}]`);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-[#e5ddd5] p-4">
      {/* Phone frame */}
      <div className="w-64 rounded-2xl bg-white shadow-lg overflow-hidden">
        {/* WhatsApp status bar */}
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-[#128c7e]" />
          <div>
            <p className="text-xs font-semibold text-white">Business Name</p>
            <p className="text-[10px] text-white/70">Online</p>
          </div>
        </div>

        {/* Chat background */}
        <div className="min-h-32 bg-[#e5ddd5] p-3">
          <div className="max-w-[85%] rounded-b-xl rounded-tr-xl bg-white p-2.5 shadow-sm">
            {header && (
              <p className="mb-1.5 text-[13px] font-semibold text-[#111b21]">
                {renderText(header)}
              </p>
            )}
            <p className="text-[13px] text-[#111b21] whitespace-pre-wrap leading-snug">
              {renderText(body || 'Your message preview will appear here…')}
            </p>
            {footer && (
              <p className="mt-1.5 text-[11px] text-[#667781]">{renderText(footer)}</p>
            )}
            <p className="mt-1 text-right text-[10px] text-[#667781]">12:00 ✓✓</p>

            {buttons && buttons.length > 0 && (
              <div className="mt-2 border-t border-[#e9edef] pt-2 space-y-1">
                {buttons.map((btn, i) => (
                  <div
                    key={i}
                    className="rounded-md bg-[#f0f2f5] px-2 py-1.5 text-center text-[12px] font-medium text-[#00a884]"
                  >
                    {btn.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/templates/components/WhatsAppPreview/
git commit -m "feat(templates): add WhatsAppPreview phone frame with variable substitution"
```

---

## Task 3: TemplateForm + TemplateList + Templates Page

**Files:**
- Create: `d:\WhatsApp-Automation\modules\templates\components\TemplateForm\index.tsx`
- Create: `d:\WhatsApp-Automation\modules\templates\components\TemplateList\index.tsx`
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\templates\page.tsx`

- [ ] **Step 1: Write TemplateForm**

Write `d:\WhatsApp-Automation\modules\templates\components\TemplateForm\index.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { WhatsAppPreview } from '../WhatsAppPreview';
import { useCreateTemplate, useUpdateTemplate } from '../../hooks/useTemplates';
import { extractVariables } from '../../services/template.service';
import type { TemplateRow } from '../../services/template.service';
import { toast } from 'sonner';

const schema = z.object({
  name:           z.string().min(1).max(255).regex(/^[a-z0-9_]+$/, 'Use only lowercase, numbers, underscores'),
  category:       z.enum(['authentication', 'marketing', 'utility']),
  language:       z.string().default('en'),
  header_content: z.string().max(60).optional().or(z.literal('')),
  body:           z.string().min(1, 'Body is required').max(1024),
  footer:         z.string().max(60).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

interface TemplateFormProps {
  open: boolean;
  onClose: () => void;
  template?: TemplateRow;
}

export function TemplateForm({ open, onClose, template }: TemplateFormProps) {
  const isEdit = !!template;
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        name:           template?.name ?? '',
        category:       template?.category ?? 'marketing',
        language:       template?.language ?? 'en',
        header_content: template?.header_content ?? '',
        body:           template?.body ?? '',
        footer:         template?.footer ?? '',
      },
    });

  const [bodyValue, headerValue, footerValue, categoryValue] = watch(['body', 'header_content', 'footer', 'category']);

  useEffect(() => {
    if (open) {
      reset({
        name:           template?.name ?? '',
        category:       template?.category ?? 'marketing',
        language:       template?.language ?? 'en',
        header_content: template?.header_content ?? '',
        body:           template?.body ?? '',
        footer:         template?.footer ?? '',
      });
    }
  }, [open, template, reset]);

  const onSubmit = async (values: FormValues) => {
    const vars = extractVariables(values.body);
    try {
      if (isEdit && template) {
        await update.mutateAsync({ id: template.id, payload: { ...values, variables: vars } });
        toast.success('Template saved');
      } else {
        await create.mutateAsync({ ...values, variables: vars, status: 'pending', buttons: [] });
        toast.success('Template created — pending Meta approval');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6">
          {/* Form */}
          <form id="template-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Template Name</Label>
              <Input id="name" {...register('name')} placeholder="welcome_message" />
              <p className="text-[11px] text-muted-foreground">Lowercase, numbers, underscores only</p>
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryValue} onValueChange={(v) => setValue('category', v as FormValues['category'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="utility">Utility</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select defaultValue="en" onValueChange={(v) => setValue('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="header_content">
                Header <span className="text-muted-foreground text-xs">(optional, max 60 chars)</span>
              </Label>
              <Input id="header_content" {...register('header_content')} placeholder="Header text" maxLength={60} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">
                Body <span className="text-muted-foreground text-xs">Use {'{{1}}'}, {'{{2}}'} for variables</span>
              </Label>
              <Textarea
                id="body"
                {...register('body')}
                placeholder="Hello {{1}}, your order {{2}} is ready!"
                className="min-h-28 resize-none"
                maxLength={1024}
              />
              {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
              <p className="text-right text-[11px] text-muted-foreground">{(bodyValue ?? '').length}/1024</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="footer">
                Footer <span className="text-muted-foreground text-xs">(optional, max 60 chars)</span>
              </Label>
              <Input id="footer" {...register('footer')} placeholder="Reply STOP to unsubscribe" maxLength={60} />
            </div>
          </form>

          {/* Preview */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>
            <WhatsAppPreview
              header={headerValue || undefined}
              body={bodyValue || ''}
              footer={footerValue || undefined}
            />
            {extractVariables(bodyValue ?? '').length > 0 && (
              <p className="text-xs text-muted-foreground">
                Variables: {extractVariables(bodyValue ?? '').join(', ')}
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="template-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write TemplateList**

Write `d:\WhatsApp-Automation\modules\templates\components\TemplateList\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTemplates, useDeleteTemplate } from '../../hooks/useTemplates';
import { TemplateForm } from '../TemplateForm';
import {
  TEMPLATE_STATUS_COLORS, CATEGORY_LABELS,
} from '../../services/template.service';
import type { TemplateRow } from '../../services/template.service';
import { toast } from 'sonner';

export function TemplateList() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | undefined>();
  const { data: templates = [], isLoading } = useTemplates();
  const remove = useDeleteTemplate();

  const handleDelete = async (t: TemplateRow) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await remove.mutateAsync(t.id);
    toast.success('Template deleted');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <h1 className="text-base font-semibold text-foreground">Templates</h1>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> New Template
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Variables</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : templates.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer hover:bg-accent">
                    <TableCell className="font-mono text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm">{CATEGORY_LABELS[t.category] ?? t.category}</TableCell>
                    <TableCell className="text-sm uppercase">{t.language}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                          TEMPLATE_STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {t.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.variables.length > 0 ? t.variables.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(t.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditing(t); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => void handleDelete(t)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {!isLoading && templates.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">No templates yet. Create your first one.</p>
          </div>
        )}
      </div>

      <TemplateForm open={formOpen} onClose={() => setFormOpen(false)} template={editing} />
    </div>
  );
}
```

- [ ] **Step 3: Write templates page**

Write `d:\WhatsApp-Automation\app\(dashboard)\templates\page.tsx`:

```typescript
import { TemplateList } from '@/modules/templates/components/TemplateList';

export default function TemplatesPage() {
  return <TemplateList />;
}
```

- [ ] **Step 4: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/templates/components/ "app/(dashboard)/templates/page.tsx"
git commit -m "feat(templates): build template list, form (with live WhatsApp preview), templates page"
```

---

## Task 4: Campaign Service + Hook

**Files:**
- Create: `d:\WhatsApp-Automation\modules\campaigns\services\campaign.service.ts`
- Create: `d:\WhatsApp-Automation\modules\campaigns\hooks\useCampaigns.ts`

- [ ] **Step 1: Write campaign service**

Write `d:\WhatsApp-Automation\modules\campaigns\services\campaign.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
export type CampaignInsert = Database['public']['Tables']['campaigns']['Insert'];

export const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  scheduled: 'bg-brand-100 text-brand-700',
  running:   'bg-amber-100 text-amber-700',
  paused:    'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-700',
};

export type CampaignWithTemplate = CampaignRow & {
  templates: { name: string; body: string } | null;
};

export async function fetchCampaigns(workspaceId: string): Promise<CampaignWithTemplate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, templates(name, body)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CampaignWithTemplate[];
}

export async function createCampaign(
  workspaceId: string,
  userId: string,
  payload: {
    name: string;
    template_id: string;
    audience_type: string;
    audience_filter: Record<string, unknown>;
    scheduled_at?: string;
  },
): Promise<CampaignRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      workspace_id:    workspaceId,
      created_by:      userId,
      name:            payload.name,
      template_id:     payload.template_id,
      audience_type:   payload.audience_type,
      audience_filter: payload.audience_filter,
      scheduled_at:    payload.scheduled_at ?? null,
      status:          payload.scheduled_at ? 'scheduled' : 'draft',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCampaignStatus(
  id: string,
  status: Database['public']['Tables']['campaigns']['Row']['status'],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('campaigns').update({ status }).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Write campaign hook**

Write `d:\WhatsApp-Automation\modules\campaigns\hooks\useCampaigns.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCampaigns, createCampaign, updateCampaignStatus } from '../services/campaign.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';

export function useCampaigns() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['campaigns', workspaceId],
    queryFn: () => fetchCampaigns(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (payload: Parameters<typeof createCampaign>[2]) =>
      createCampaign(workspaceId!, userId!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] }),
  });
}

export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Parameters<typeof updateCampaignStatus>[1] }) =>
      updateCampaignStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] }),
  });
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/campaigns/services/campaign.service.ts modules/campaigns/hooks/useCampaigns.ts
git commit -m "feat(campaigns): add campaign service and hooks (CRUD, status update)"
```

---

## Task 5: CampaignWizard Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\campaigns\components\CampaignWizard\index.tsx`

- [ ] **Step 1: Write CampaignWizard**

Write `d:\WhatsApp-Automation\modules\campaigns\components\CampaignWizard\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTemplates } from '@/modules/templates/hooks/useTemplates';
import { useCreateCampaign } from '../../hooks/useCampaigns';
import { toast } from 'sonner';

const STEPS = ['Name & Setup', 'Select Template', 'Audience', 'Schedule', 'Review'];

interface WizardState {
  name:          string;
  templateId:    string;
  audienceType:  'all' | 'tag';
  audienceTag:   string;
  scheduledAt:   string;
}

interface CampaignWizardProps {
  open: boolean;
  onClose: () => void;
}

export function CampaignWizard({ open, onClose }: CampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    name: '', templateId: '', audienceType: 'all', audienceTag: '', scheduledAt: '',
  });
  const { data: templates = [] } = useTemplates();
  const create = useCreateCampaign();

  const selectedTemplate = templates.find((t) => t.id === state.templateId);
  const progress = ((step + 1) / STEPS.length) * 100;

  const canProceed = () => {
    if (step === 0) return state.name.trim().length > 0;
    if (step === 1) return !!state.templateId;
    return true;
  };

  const handleCreate = async () => {
    try {
      await create.mutateAsync({
        name:            state.name,
        template_id:     state.templateId,
        audience_type:   state.audienceType,
        audience_filter: state.audienceType === 'tag' ? { tag: state.audienceTag } : {},
        scheduled_at:    state.scheduledAt || undefined,
      });
      toast.success('Campaign created successfully!');
      setStep(0);
      setState({ name: '', templateId: '', audienceType: 'all', audienceTag: '', scheduledAt: '' });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  };

  const handleClose = () => {
    setStep(0);
    setState({ name: '', templateId: '', audienceType: 'all', audienceTag: '', scheduledAt: '' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Campaign</DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="space-y-2">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                    i < step && 'bg-brand-500 text-white',
                    i === step && 'bg-brand-500 text-white ring-2 ring-brand-500/30',
                    i > step && 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span className={cn('text-[10px] hidden sm:block', i === step ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-40 py-2">
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Campaign Name</Label>
                <Input
                  id="camp-name"
                  value={state.name}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Black Friday Promo 2026"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Label>Select Template</Label>
              {templates.filter((t) => t.status === 'approved').length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved templates yet. Create and wait for Meta approval first.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {templates.filter((t) => t.status === 'approved').map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setState((s) => ({ ...s, templateId: t.id }))}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        state.templateId === t.id
                          ? 'border-brand-500 bg-brand-500/5'
                          : 'border-border hover:border-brand-300',
                      )}
                    >
                      <p className="text-sm font-medium font-mono">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Label>Audience</Label>
              <Select
                value={state.audienceType}
                onValueChange={(v) => setState((s) => ({ ...s, audienceType: v as WizardState['audienceType'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contacts</SelectItem>
                  <SelectItem value="tag">Filter by Tag</SelectItem>
                </SelectContent>
              </Select>
              {state.audienceType === 'tag' && (
                <div className="space-y-1.5">
                  <Label htmlFor="tag">Tag Name</Label>
                  <Input
                    id="tag"
                    value={state.audienceTag}
                    onChange={(e) => setState((s) => ({ ...s, audienceTag: e.target.value }))}
                    placeholder="vip, leads, etc."
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Label>Schedule (optional)</Label>
              <p className="text-xs text-muted-foreground">Leave empty to save as draft.</p>
              <Input
                type="datetime-local"
                value={state.scheduledAt}
                onChange={(e) => setState((s) => ({ ...s, scheduledAt: e.target.value }))}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{state.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Template</span><span className="font-mono text-xs">{selectedTemplate?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Audience</span><span className="font-medium capitalize">{state.audienceType === 'tag' ? `Tag: ${state.audienceTag}` : 'All Contacts'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Schedule</span><span className="font-medium">{state.scheduledAt ? new Date(state.scheduledAt).toLocaleString() : 'Draft'}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => step === 0 ? handleClose() : setStep((s) => s - 1)}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canProceed()} onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button disabled={create.isPending} onClick={() => void handleCreate()}>
              {create.isPending ? 'Creating…' : 'Create Campaign'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/campaigns/components/CampaignWizard/
git commit -m "feat(campaigns): add 5-step CampaignWizard (name, template, audience, schedule, review)"
```

---

## Task 6: CampaignList + Campaigns Page

**Files:**
- Create: `d:\WhatsApp-Automation\modules\campaigns\components\CampaignList\index.tsx`
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\campaigns\page.tsx`

- [ ] **Step 1: Write CampaignList**

Write `d:\WhatsApp-Automation\modules\campaigns\components\CampaignList\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCampaigns } from '../../hooks/useCampaigns';
import { CampaignWizard } from '../CampaignWizard';
import { CAMPAIGN_STATUS_COLORS } from '../../services/campaign.service';

export function CampaignList() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data: campaigns = [], isLoading } = useCampaigns();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <h1 className="text-base font-semibold text-foreground">Campaigns</h1>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setWizardOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Read Rate</TableHead>
              <TableHead>Scheduled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : campaigns.map((c) => {
                  const deliveryPct = c.total_recipients > 0
                    ? Math.round((c.delivered_count / c.total_recipients) * 100)
                    : 0;
                  const readPct = c.delivered_count > 0
                    ? Math.round((c.read_count / c.delivered_count) * 100)
                    : 0;

                  return (
                    <TableRow key={c.id} className="hover:bg-accent">
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {c.templates?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                            CAMPAIGN_STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {c.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-24">
                          <Progress value={deliveryPct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground w-8">{deliveryPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{readPct}%</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.scheduled_at ? format(new Date(c.scheduled_at), 'MMM d, HH:mm') : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        {!isLoading && campaigns.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">No campaigns yet. Launch your first one.</p>
          </div>
        )}
      </div>

      <CampaignWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Write campaigns page**

Write `d:\WhatsApp-Automation\app\(dashboard)\campaigns\page.tsx`:

```typescript
import { CampaignList } from '@/modules/campaigns/components/CampaignList';

export default function CampaignsPage() {
  return <CampaignList />;
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/campaigns/components/CampaignList/ "app/(dashboard)/campaigns/page.tsx"
git commit -m "feat(campaigns): add CampaignList table with delivery progress and campaigns page"
```

---

## Task 7: Build Verification

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
git commit -m "feat: Phase 8 complete — Templates (form + WhatsApp preview) + Campaigns (5-step wizard)"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| Template list with status badges | ✅ | Task 3 |
| Template create/edit form | ✅ | Task 3 |
| Variable insertion `{{1}}`, `{{2}}` | ✅ | Tasks 1, 3 |
| Live WhatsApp phone preview | ✅ | Task 2 |
| Template categories + language | ✅ | Task 3 |
| Campaign builder 5-step wizard | ✅ | Task 5 |
| Audience: all contacts or tag filter | ✅ | Task 5 |
| Schedule (datetime picker) | ✅ | Task 5 |
| Campaign list with delivery stats | ✅ | Task 6 |
| Delivery + read rate progress bars | ✅ | Task 6 |

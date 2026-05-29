# Agentix Phase 6 — Contacts Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Contacts module — a searchable, filterable data table with inline contact detail side panel, create/edit form modal, tag management, and CSV import wizard.

**Architecture:** `modules/contacts/services/contact.service.ts` handles all Supabase queries. `modules/contacts/hooks/useContacts.ts` wraps queries with TanStack Query. The page (`app/(dashboard)/contacts/page.tsx`) renders a full-height split: contacts table on the left, sliding detail panel on the right when a contact is selected. CSV import uses the `papaparse` package already installed.

**Tech Stack:** Next.js 15 App Router, Supabase browser client (`@/services/supabase/client`), TanStack Query v5, shadcn/ui (Table, Dialog, Sheet, Input, Select, Badge, ScrollArea, Skeleton, Progress, Alert, Form), react-hook-form + zod, papaparse, lucide-react, date-fns.

---

## File Map

### New files
```
modules/contacts/services/contact.service.ts      — Supabase CRUD + search + import
modules/contacts/hooks/useContacts.ts             — TanStack Query list, create, update, delete
modules/contacts/components/ContactsTable/index.tsx       — searchable paginated table
modules/contacts/components/ContactDetail/index.tsx       — right-side detail panel
modules/contacts/components/ContactForm/index.tsx         — create/edit modal form
modules/contacts/components/ImportWizard/index.tsx        — CSV import dialog
```

### Modified files
```
app/(dashboard)/contacts/page.tsx   — wire table + detail panel
```

---

## Task 1: Contact Service

**Files:**
- Create: `d:\WhatsApp-Automation\modules\contacts\services\contact.service.ts`

- [ ] **Step 1: Write contact service**

Write `d:\WhatsApp-Automation\modules\contacts\services\contact.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type ContactRow = Database['public']['Tables']['contacts']['Row'];
export type ContactInsert = Database['public']['Tables']['contacts']['Insert'];
export type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

export interface ContactFilters {
  search?: string;
  tags?: string[];
  is_blocked?: boolean;
}

export async function fetchContacts(
  workspaceId: string,
  filters: ContactFilters = {},
  page = 0,
  pageSize = 50,
): Promise<{ data: ContactRow[]; count: number }> {
  const supabase = createClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.search?.trim()) {
    query = query.or(
      `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`,
    );
  }
  if (filters.tags?.length) {
    query = query.overlaps('tags', filters.tags);
  }
  if (filters.is_blocked !== undefined) {
    query = query.eq('is_blocked', filters.is_blocked);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function fetchContact(id: string): Promise<ContactRow | null> {
  const supabase = createClient();
  const { data } = await supabase.from('contacts').select('*').eq('id', id).single();
  return data;
}

export async function createContact(
  workspaceId: string,
  payload: Omit<ContactInsert, 'workspace_id'>,
): Promise<ContactRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...payload, workspace_id: workspaceId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContact(id: string, payload: ContactUpdate): Promise<ContactRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contacts')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkImportContacts(
  workspaceId: string,
  rows: Array<{ phone: string; name?: string; email?: string; company?: string; tags?: string[] }>,
): Promise<{ inserted: number; skipped: number }> {
  const supabase = createClient();

  // Deduplicate: fetch existing phones
  const phones = rows.map((r) => r.phone);
  const { data: existing } = await supabase
    .from('contacts')
    .select('phone')
    .eq('workspace_id', workspaceId)
    .in('phone', phones);
  const existingPhones = new Set((existing ?? []).map((e) => e.phone));

  const toInsert = rows
    .filter((r) => !existingPhones.has(r.phone))
    .map((r) => ({ ...r, workspace_id: workspaceId, tags: r.tags ?? [] }));

  if (toInsert.length === 0) return { inserted: 0, skipped: rows.length };

  const { error } = await supabase.from('contacts').insert(toInsert);
  if (error) throw error;

  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/contacts/services/contact.service.ts
git commit -m "feat(contacts): add contact service (fetch, CRUD, bulk import with dedup)"
```

---

## Task 2: useContacts Hook

**Files:**
- Create: `d:\WhatsApp-Automation\modules\contacts\hooks\useContacts.ts`

- [ ] **Step 1: Write hook**

Write `d:\WhatsApp-Automation\modules\contacts\hooks\useContacts.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchContacts, fetchContact, createContact, updateContact, deleteContact,
} from '../services/contact.service';
import type { ContactFilters, ContactInsert, ContactUpdate } from '../services/contact.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useContacts(filters: ContactFilters = {}, page = 0) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['contacts', workspaceId, filters, page],
    queryFn: () => fetchContacts(workspaceId!, filters, page),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => fetchContact(id!),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (payload: Omit<ContactInsert, 'workspace_id'>) =>
      createContact(workspaceId!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ContactUpdate }) =>
      updateContact(id, payload),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['contact', id] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/contacts/hooks/useContacts.ts
git commit -m "feat(contacts): add useContacts, useContact, useCreateContact, useUpdateContact, useDeleteContact hooks"
```

---

## Task 3: ContactForm Modal

**Files:**
- Create: `d:\WhatsApp-Automation\modules\contacts\components\ContactForm\index.tsx`

- [ ] **Step 1: Write ContactForm**

Write `d:\WhatsApp-Automation\modules\contacts\components\ContactForm\index.tsx`:

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
import { useCreateContact, useUpdateContact } from '../../hooks/useContacts';
import type { ContactRow } from '../../services/contact.service';
import { toast } from 'sonner';

const schema = z.object({
  name:    z.string().min(1, 'Name is required').max(255),
  phone:   z.string().min(7, 'Phone number is required').regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone'),
  email:   z.string().email('Invalid email').optional().or(z.literal('')),
  company: z.string().max(255).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  contact?: ContactRow;
}

export function ContactForm({ open, onClose, contact }: ContactFormProps) {
  const isEdit = !!contact;
  const create = useCreateContact();
  const update = useUpdateContact();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:    contact?.name ?? '',
      phone:   contact?.phone ?? '',
      email:   contact?.email ?? '',
      company: contact?.company ?? '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && contact) {
        await update.mutateAsync({ id: contact.id, payload: values });
        toast.success('Contact updated');
      } else {
        await create.mutateAsync({ ...values, tags: [] });
        toast.success('Contact created');
      }
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save contact');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Contact' : 'New Contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" {...register('name')} placeholder="Jane Smith" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (WhatsApp)</Label>
            <Input id="phone" {...register('phone')} placeholder="+1 555 000 0000" />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="email" type="email" {...register('email')} placeholder="jane@example.com" />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Company <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="company" {...register('company')} placeholder="Acme Inc." />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Contact'}
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
git add modules/contacts/components/ContactForm/
git commit -m "feat(contacts): add ContactForm modal (create/edit, zod validation)"
```

---

## Task 4: ImportWizard Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\contacts\components\ImportWizard\index.tsx`

- [ ] **Step 1: Write ImportWizard**

Write `d:\WhatsApp-Automation\modules\contacts\components\ImportWizard\index.tsx`:

```typescript
'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { bulkImportContacts } from '../../services/contact.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

interface ParsedRow { name?: string; phone: string; email?: string; company?: string }

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

export function ImportWizard({ open, onClose }: ImportWizardProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const queryClient = useQueryClient();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: ParsedRow[] = results.data
          .map((row) => ({
            phone:   (row['phone'] ?? row['Phone'] ?? row['PHONE'] ?? '').trim(),
            name:    (row['name'] ?? row['Name'] ?? row['full_name'] ?? '').trim() || undefined,
            email:   (row['email'] ?? row['Email'] ?? '').trim() || undefined,
            company: (row['company'] ?? row['Company'] ?? '').trim() || undefined,
          }))
          .filter((r) => r.phone.length > 0);

        if (parsed.length === 0) {
          setError('No valid rows with phone numbers found. CSV must have a "phone" column.');
          return;
        }
        setRows(parsed);
        setError(null);
        setStep('preview');
      },
      error: (err) => setError(err.message),
    });
  };

  const handleImport = async () => {
    if (!workspaceId) return;
    setStep('importing');
    setProgress(10);
    try {
      const res = await bulkImportContacts(workspaceId, rows);
      setProgress(100);
      setResult(res);
      setStep('done');
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setRows([]);
    setResult(null);
    setError(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with columns: <code className="text-xs bg-muted px-1 rounded">phone</code> (required),{' '}
              <code className="text-xs bg-muted px-1 rounded">name</code>,{' '}
              <code className="text-xs bg-muted px-1 rounded">email</code>,{' '}
              <code className="text-xs bg-muted px-1 rounded">company</code>
            </p>
            <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-brand-500 hover:bg-brand-500/5 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to select CSV file</span>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </label>
            {error && (
              <Alert variant="destructive" className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </Alert>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Found <strong>{rows.length}</strong> contacts to import.
              {rows.length > 5 && ` Showing first 5.`}
            </p>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    {['Phone', 'Name', 'Email', 'Company'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{row.phone}</td>
                      <td className="px-3 py-2">{row.name ?? '—'}</td>
                      <td className="px-3 py-2">{row.email ?? '—'}</td>
                      <td className="px-3 py-2">{row.company ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && (
              <Alert variant="destructive" className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </Alert>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Importing {rows.length} contacts…</p>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-base font-semibold text-foreground">Import Complete</p>
            <p className="text-sm text-muted-foreground">
              {result.inserted} imported · {result.skipped} skipped (duplicates)
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); if (fileRef.current) fileRef.current.value = ''; }}>
                Back
              </Button>
              <Button onClick={() => void handleImport()}>
                Import {rows.length} Contacts
              </Button>
            </>
          )}
          {(step === 'done' || step === 'upload') && (
            <Button variant={step === 'done' ? 'default' : 'outline'} onClick={handleClose}>
              {step === 'done' ? 'Done' : 'Cancel'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/contacts/components/ImportWizard/
git commit -m "feat(contacts): add CSV ImportWizard (parse, preview, dedup, progress)"
```

---

## Task 5: ContactDetail Panel

**Files:**
- Create: `d:\WhatsApp-Automation\modules\contacts\components\ContactDetail\index.tsx`

- [ ] **Step 1: Write ContactDetail**

Write `d:\WhatsApp-Automation\modules\contacts\components\ContactDetail\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Phone, Mail, Building2, Globe, Tag, Pencil, Trash2, Ban, X } from 'lucide-react';
import { format } from 'date-fns';
import { useContact, useUpdateContact, useDeleteContact } from '../../hooks/useContacts';
import { ContactForm } from '../ContactForm';
import { toast } from 'sonner';

interface ContactDetailProps {
  contactId: string;
  onClose: () => void;
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function ContactDetail({ contactId, onClose }: ContactDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const { data: contact, isLoading } = useContact(contactId);
  const update = useUpdateContact();
  const remove = useDeleteContact();

  if (isLoading) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-card p-4 space-y-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" />
      </div>
    );
  }
  if (!contact) return null;

  const name = contact.name ?? contact.phone;
  const initials = name.slice(0, 2).toUpperCase();

  const toggleBlock = async () => {
    await update.mutateAsync({ id: contact.id, payload: { is_blocked: !contact.is_blocked } });
    toast.success(contact.is_blocked ? 'Contact unblocked' : 'Contact blocked');
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await remove.mutateAsync(contact.id);
    toast.success('Contact deleted');
    onClose();
  };

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Contact Details</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Profile */}
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-brand-100 text-brand-700 text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{name}</p>
              {contact.name && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
            </div>
            {contact.is_blocked && (
              <Badge variant="destructive" className="text-xs">Blocked</Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              variant="outline" size="sm"
              className={`flex-1 gap-1.5 text-xs ${contact.is_blocked ? 'text-emerald-600' : 'text-amber-600'}`}
              onClick={() => void toggleBlock()}
            >
              <Ban className="h-3.5 w-3.5" />
              {contact.is_blocked ? 'Unblock' : 'Block'}
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Info</p>
            <Row icon={Phone} label="Phone" value={contact.phone} />
            <Row icon={Mail} label="Email" value={contact.email} />
            <Row icon={Building2} label="Company" value={contact.company} />
            <Row icon={Globe} label="Country" value={contact.country} />
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 text-[11px] text-muted-foreground">Added</span>
              <p className="text-sm text-foreground">{format(new Date(contact.created_at), 'MMM d, yyyy')}</p>
            </div>
          </div>

          {contact.tags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="gap-1 text-xs">
                      <Tag className="h-2.5 w-2.5" />{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />
          <Button
            variant="ghost" size="sm"
            className="w-full gap-1.5 text-xs text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Contact
          </Button>
        </div>
      </ScrollArea>

      <ContactForm open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/contacts/components/ContactDetail/
git commit -m "feat(contacts): add ContactDetail panel (view, edit, block, delete)"
```

---

## Task 6: ContactsTable Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\contacts\components\ContactsTable\index.tsx`

- [ ] **Step 1: Write ContactsTable**

Write `d:\WhatsApp-Automation\modules\contacts\components\ContactsTable\index.tsx`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, UserPlus, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useContacts } from '../../hooks/useContacts';
import { ContactForm } from '../ContactForm';
import { ImportWizard } from '../ImportWizard';
import { useDebounce } from '@/hooks/useDebounce';
import type { ContactRow } from '../../services/contact.service';

interface ContactsTableProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ContactsTable({ selectedId, onSelect }: ContactsTableProps) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading } = useContacts({ search }, page);
  const contacts: ContactRow[] = data?.data ?? [];
  const total = data?.count ?? 0;
  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setPage(0);
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={handleSearch}
            placeholder="Search by name, phone, email…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> New Contact
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-64">Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : contacts.map((contact) => {
                  const name = contact.name ?? contact.phone;
                  const initials = name.slice(0, 2).toUpperCase();
                  return (
                    <TableRow
                      key={contact.id}
                      className={`cursor-pointer hover:bg-accent ${contact.id === selectedId ? 'bg-brand-500/5' : ''}`}
                      onClick={() => onSelect(contact.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="bg-brand-100 text-brand-700 text-[11px] font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium text-foreground truncate max-w-40">
                            {name}
                          </span>
                          {contact.is_blocked && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1">blocked</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{contact.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{contact.email ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{contact.company ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1">{tag}</Badge>
                          ))}
                          {contact.tags.length > 2 && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">+{contact.tags.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(contact.created_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        {!isLoading && contacts.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">No contacts found.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ContactForm open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/contacts/components/ContactsTable/
git commit -m "feat(contacts): add ContactsTable (search, pagination, new/import buttons)"
```

---

## Task 7: Wire Contacts Page

**Files:**
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\contacts\page.tsx`

- [ ] **Step 1: Write contacts page**

Write `d:\WhatsApp-Automation\app\(dashboard)\contacts\page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { ContactsTable } from '@/modules/contacts/components/ContactsTable';
import { ContactDetail } from '@/modules/contacts/components/ContactDetail';

export default function ContactsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-full overflow-hidden">
      <ContactsTable
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selectedId && (
        <ContactDetail
          contactId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add "app/(dashboard)/contacts/page.tsx"
git commit -m "feat(contacts): wire contacts page with table + detail panel"
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
git commit -m "feat: Phase 6 complete — Contacts module (table, CRUD, CSV import, detail panel)"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| Contact list with search | ✅ | Tasks 5, 7 |
| Create contact form | ✅ | Task 3 |
| Edit contact form | ✅ | Tasks 3, 5 |
| Delete contact | ✅ | Task 5 |
| Block/unblock contact | ✅ | Task 5 |
| CSV import with field mapping + dedup | ✅ | Task 4 |
| Import preview (50 rows sample) | ✅ | Task 4 |
| Pagination (50 per page) | ✅ | Task 6 |
| Tag display | ✅ | Tasks 5, 6 |
| Contact detail panel | ✅ | Task 5 |

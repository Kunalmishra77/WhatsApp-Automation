'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Send, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTemplates, useDeleteTemplate, useSubmitTemplate, useSyncTemplates } from '../../hooks/useTemplates';
import { TemplateForm } from '../TemplateForm';
import { TEMPLATE_STATUS_COLORS, CATEGORY_LABELS } from '../../services/template.service';
import type { TemplateRow } from '../../services/template.service';
import { toast } from 'sonner';

export function TemplateList() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | undefined>();
  const { data: templates = [], isLoading } = useTemplates();
  const remove = useDeleteTemplate();
  const submit = useSubmitTemplate();
  const sync   = useSyncTemplates();

  const handleDelete = async (t: TemplateRow) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await remove.mutateAsync(t.id);
    toast.success('Template deleted');
  };

  const handleSubmit = async (t: TemplateRow) => {
    try {
      const result = await submit.mutateAsync(t.id) as { metaStatus?: string };
      toast.success(`Submitted to Meta — status: ${result?.metaStatus ?? 'PENDING'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit template');
    }
  };

  const handleSync = async () => {
    try {
      const result = await sync.mutateAsync();
      toast.success(`Synced from Meta — ${result.new} new, ${result.updated} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <h1 className="text-base font-semibold text-foreground">Templates</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={sync.isPending}
            onClick={() => void handleSync()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />
            {sync.isPending ? 'Syncing…' : 'Sync from Meta'}
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Template
          </Button>
        </div>
      </div>

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
              <TableHead className="w-28" />
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
                  <TableRow key={t.id} className="hover:bg-accent">
                    <TableCell className="font-mono text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm">{CATEGORY_LABELS[t.category] ?? t.category}</TableCell>
                    <TableCell className="text-sm uppercase">{t.language}</TableCell>
                    <TableCell>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', TEMPLATE_STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600')}>
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
                        {t.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-brand-600 hover:text-brand-700"
                            title="Submit to Meta for approval"
                            disabled={submit.isPending}
                            onClick={() => void handleSubmit(t)}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
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

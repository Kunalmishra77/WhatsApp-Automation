'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Send, RefreshCw, FileText, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTemplates, useDeleteTemplate, useSubmitTemplate, useSyncTemplates } from '../../hooks/useTemplates';
import { TemplateForm } from '../TemplateForm';
import { TEMPLATE_STATUS_COLORS, CATEGORY_LABELS } from '../../services/template.service';
import type { TemplateRow } from '../../services/template.service';
import { toast } from 'sonner';

export function TemplateList() {
  const [formOpen,       setFormOpen]       = useState(false);
  const [editing,        setEditing]        = useState<TemplateRow | undefined>();
  const [pendingDelete,  setPendingDelete]  = useState<TemplateRow | null>(null);
  const [deleting,       setDeleting]       = useState(false);

  const { data: templates = [], isLoading } = useTemplates();
  const remove = useDeleteTemplate();
  const submit = useSubmitTemplate();
  const sync   = useSyncTemplates();

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success('Template deleted');
      setPendingDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
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
      <div className="flex shrink-0 items-center justify-between flex-wrap gap-3 border-b border-border bg-card px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 shrink-0">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground leading-none">Message Templates</h1>
            <p className="text-xs text-muted-foreground mt-0.5">WhatsApp-approved templates for campaigns</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={sync.isPending}
            onClick={() => void handleSync()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />
            {sync.isPending ? 'Syncing…' : 'Sync from Meta'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Template
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="hidden md:table-cell">Language</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Variables</TableHead>
              <TableHead className="hidden lg:table-cell">Created</TableHead>
              <TableHead className="w-24" />
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
                    <TableCell className="hidden sm:table-cell text-sm">{CATEGORY_LABELS[t.category] ?? t.category}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm uppercase">{t.language}</TableCell>
                    <TableCell>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', TEMPLATE_STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600')}>
                        {t.status}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {t.variables.length > 0 ? t.variables.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {format(new Date(t.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {t.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-brand-600 hover:text-brand-700"
                            title="Submit to Meta for approval"
                            disabled={submit.isPending}
                            onClick={() => void handleSubmit(t)}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditing(t); setFormOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDelete(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {!isLoading && templates.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No templates yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">Create your first WhatsApp-approved template to use in campaigns.</p>
            </div>
            <Button size="sm" className="gap-1.5 mt-1" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> New Template
            </Button>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 mb-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              <span className="font-mono font-semibold text-foreground">{pendingDelete?.name}</span> will be permanently deleted.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateForm open={formOpen} onClose={() => setFormOpen(false)} template={editing} />
    </div>
  );
}

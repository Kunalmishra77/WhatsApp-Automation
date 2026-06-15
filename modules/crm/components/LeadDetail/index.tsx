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
import { Pencil, Trash2, DollarSign, User, Tag, Sparkles } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { format } from 'date-fns';
import { useDeleteLead } from '../../hooks/useLeads';
import { LeadForm } from '../LeadForm';
import type { LeadRow } from '../../services/lead.service';
import { STAGE_LABELS, STAGE_COLORS } from '../../services/lead.service';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useMutation, useQueryClient } from '@tanstack/react-query';

async function fetchLeadDetail(id: string): Promise<(LeadRow & { contacts: { name: string | null; phone: string } | null }) | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('leads')
    .select('*, contacts(name, phone)')
    .eq('id', id)
    .single();
  return data as (LeadRow & { contacts: { name: string | null; phone: string } | null }) | null;
}

interface LeadDetailProps {
  leadId: string | null;
  onClose: () => void;
}

export function LeadDetail({ leadId, onClose }: LeadDetailProps) {
  const [editOpen,       setEditOpen]       = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deleting,       setDeleting]       = useState(false);
  const remove      = useDeleteLead();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLeadDetail(leadId!),
    enabled: !!leadId,
  });

  const scoreLead = useMutation({
    mutationFn: () =>
      fetch(`/api/leads/${leadId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      }).then((r) => r.json() as Promise<{ score: number; error?: string }>),
    onSuccess: (data) => {
      if (data.error) { toast.error(data.error); return; }
      toast.success(`AI Score: ${data.score}/100`);
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['leads', workspaceId] });
    },
  });

  const handleDelete = async () => {
    if (!lead) return;
    setDeleting(true);
    try {
      await remove.mutateAsync(lead.id);
      toast.success('Lead deleted');
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete lead');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-96 sm:max-w-96">
        {lead ? (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-start justify-between gap-2">
                <SheetTitle className="text-base leading-snug">{lead.title}</SheetTitle>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(lead as any).ai_score != null && (
                    <span
                      className={cn(
                        'text-[11px] font-bold px-2 py-0.5 rounded-full border',
                        (lead as any).ai_score >= 71
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : (lead as any).ai_score >= 31
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : 'text-red-700 bg-red-50 border-red-200',
                      )}
                    >
                      Score: {(lead as any).ai_score}
                    </span>
                  )}
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STAGE_COLORS[lead.stage])}>
                    {STAGE_LABELS[lead.stage]}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 w-full"
                onClick={() => void scoreLead.mutate()}
                disabled={scoreLead.isPending}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {scoreLead.isPending ? 'Scoring…' : 'Calculate AI Score'}
              </Button>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto">
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
                    <span className="font-medium text-amber-600">{format(new Date(lead.follow_up_at), 'MMM d, yyyy')}</span>
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
                  className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>

            <LeadForm open={editOpen} onClose={() => setEditOpen(false)} lead={lead} />

            <ConfirmDialog
              open={confirmDelete}
              title="Delete lead?"
              description={`"${lead.title}" will be permanently removed from the pipeline. This cannot be undone.`}
              confirmLabel="Delete Lead"
              loading={deleting}
              onConfirm={() => void handleDelete()}
              onCancel={() => setConfirmDelete(false)}
            />
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

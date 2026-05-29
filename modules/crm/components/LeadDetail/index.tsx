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
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeleteLead();

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLeadDetail(leadId!),
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
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STAGE_COLORS[lead.stage])}>
                  {STAGE_LABELS[lead.stage]}
                </span>
              </div>
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
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => void handleDelete()}>
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

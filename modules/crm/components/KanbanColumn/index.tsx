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
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STAGE_COLORS[stage])}>
            {STAGE_LABELS[stage]}
          </span>
          <Badge variant="outline" className="h-5 text-[11px] px-1.5">{leads.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {totalValue > 0 && (
            <span className="text-[11px] text-emerald-600 font-medium">${totalValue.toLocaleString()}</span>
          )}
          <Button
            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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

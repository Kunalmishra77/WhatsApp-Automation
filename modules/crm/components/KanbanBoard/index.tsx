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
import { Plus, Flame, Thermometer, Snowflake, LayoutGrid } from 'lucide-react';
import { KanbanColumn } from '../KanbanColumn';
import { LeadCard } from '../LeadCard';
import { LeadDetail } from '../LeadDetail';
import { LeadForm } from '../LeadForm';
import { useLeads, useMoveLeadStage } from '../../hooks/useLeads';
import { LEAD_STAGES } from '../../services/lead.service';
import type { LeadStage, LeadWithContact } from '../../services/lead.service';

const TEMP_FILTERS = [
  { key: '',     label: 'All',  Icon: LayoutGrid,  color: 'text-muted-foreground' },
  { key: 'hot',  label: 'Hot',  Icon: Flame,       color: 'text-red-500'          },
  { key: 'warm', label: 'Warm', Icon: Thermometer, color: 'text-amber-500'        },
  { key: 'cold', label: 'Cold', Icon: Snowflake,   color: 'text-blue-500'         },
] as const;

export function KanbanBoard() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [createOpen, setCreateOpen]         = useState(false);
  const [dragging,   setDragging]           = useState<LeadWithContact | null>(null);
  const [tempFilter, setTempFilter]         = useState('');
  const { data: pipeline, isLoading } = useLeads();
  const moveStage = useMoveLeadStage();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = (event: { active: { id: string | number } }) => {
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
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-foreground">CRM Pipeline</h1>
            {/* Temperature filter pills */}
            <div className="flex items-center gap-1">
              {TEMP_FILTERS.map((f) => {
                const Icon = f.Icon;
                const active = tempFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setTempFilter(f.key)}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                      active
                        ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                        : 'text-muted-foreground border-border hover:border-brand-300 hover:bg-muted/50'
                    }`}
                  >
                    <Icon className={`h-3 w-3 ${active ? 'text-white' : f.color}`} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Lead
          </Button>
        </div>

        <div className="flex-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 p-6 h-full">
              {LEAD_STAGES.map((stage) => {
                const leads = (pipeline?.[stage] ?? []).filter(
                  (l) => !tempFilter || ((l as any).temperature || 'warm') === tempFilter,
                );
                return (
                  <KanbanColumn
                    key={stage}
                    stage={stage}
                    leads={leads}
                    onLeadClick={setSelectedLeadId}
                  />
                );
              })}
            </div>

            <DragOverlay>
              {dragging && <LeadCard lead={dragging} onClick={() => {}} />}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      <LeadDetail leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      <LeadForm open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

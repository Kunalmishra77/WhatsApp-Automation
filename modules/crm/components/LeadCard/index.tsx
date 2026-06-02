'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DollarSign } from 'lucide-react';
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

const TEMPERATURE_CONFIG: Record<string, { label: string; classes: string; dot: string }> = {
  hot:  { label: 'Hot',  classes: 'text-red-600 bg-red-50 border-red-200',     dot: '🔴' },
  warm: { label: 'Warm', classes: 'text-amber-600 bg-amber-50 border-amber-200', dot: '🟡' },
  cold: { label: 'Cold', classes: 'text-blue-600 bg-blue-50 border-blue-200',   dot: '🔵' },
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
          {/* Temperature badge — shown always (hot/warm/cold) */}
          {(lead as any).temperature && (lead as any).temperature !== 'warm' && (
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                TEMPERATURE_CONFIG[(lead as any).temperature as string]?.classes ?? '',
              )}
            >
              {TEMPERATURE_CONFIG[(lead as any).temperature as string]?.dot}{' '}
              {TEMPERATURE_CONFIG[(lead as any).temperature as string]?.label}
            </span>
          )}
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
        <div className="flex items-center gap-1.5">
          {lead.value != null && lead.value > 0 && (
            <div className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600">
              <DollarSign className="h-3 w-3" />
              {lead.value.toLocaleString()}
            </div>
          )}
          {/* AI Score badge */}
          {(lead as any).ai_score != null && (
            <span
              className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                (lead as any).ai_score >= 71
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : (lead as any).ai_score >= 31
                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-red-700 bg-red-50 border-red-200',
              )}
              title="AI Lead Score"
            >
              {(lead as any).ai_score}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

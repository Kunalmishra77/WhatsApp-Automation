'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { ConversationSearchSummary } from '../../services/conversation.service';

interface Tile {
  key: keyof ConversationSearchSummary;
  label: string;
  dot?: string;
}

const TILES: Tile[] = [
  { key: 'new_today', label: 'New today' },
  { key: 'new_week',  label: 'New week' },
  { key: 'new_month', label: 'New month' },
  { key: 'unread',    label: 'Unread' },
  { key: 'hot',    label: 'Hot',    dot: 'bg-red-500' },
  { key: 'warm',   label: 'Warm',   dot: 'bg-amber-500' },
  { key: 'cold',   label: 'Cold',   dot: 'bg-sky-500' },
  { key: 'unanswered', label: 'Unanswered' },
];

interface ConversationSummaryBarProps {
  summary: ConversationSearchSummary | undefined;
  isLoading: boolean;
}

// Small stat-tile strip reflecting the active filters — reporting summary from
// GET /api/conversations/search's `summary` object (see conversation.service.ts).
export function ConversationSummaryBar({ summary, isLoading }: ConversationSummaryBarProps) {
  return (
    <div className="shrink-0 border-b border-border px-3 py-2">
      <div className="grid grid-cols-4 gap-1">
        {TILES.map((tile) => (
          <div
            key={tile.key}
            className="flex flex-col items-center justify-center rounded-md bg-accent/50 px-1 py-1.5 text-center"
            title={tile.label}
          >
            {isLoading || !summary ? (
              <Skeleton className="h-4 w-6" />
            ) : (
              <span className="flex items-center gap-1 text-sm font-bold text-foreground leading-none">
                {tile.dot && <span className={cn('h-1.5 w-1.5 rounded-full', tile.dot)} />}
                {summary[tile.key]}
              </span>
            )}
            <span className="mt-1 truncate text-[9px] font-medium leading-none text-muted-foreground">
              {tile.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

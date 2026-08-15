'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { ConversationSearchSummary } from '../../services/conversation.service';
import type { ConversationAdvancedFilters } from '../ConversationFilters';

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

// Each tile applies one advanced filter on click, toggling it off if already active —
// mirrors the toggle pattern in ConversationFilters (temperature/flag pill buttons).
// 'quick' values match QUICK_RANGES/QuickRange keys in lib/date-range.ts exactly.
function isTileActive(key: Tile['key'], adv: ConversationAdvancedFilters): boolean {
  switch (key) {
    case 'new_today': return adv.quick === 'today';
    case 'new_week':  return adv.quick === 'this_week';
    case 'new_month': return adv.quick === 'this_month';
    case 'unread':      return adv.flag === 'unread';
    case 'unanswered':  return adv.flag === 'unanswered';
    case 'hot':  return adv.temperature === 'hot';
    case 'warm': return adv.temperature === 'warm';
    case 'cold': return adv.temperature === 'cold';
    default: return false;
  }
}

function toggleTileFilter(key: Tile['key'], adv: ConversationAdvancedFilters): ConversationAdvancedFilters {
  const next = { ...adv };
  const active = isTileActive(key, adv);
  switch (key) {
    case 'new_today':
    case 'new_week':
    case 'new_month': {
      if (active) {
        delete next.quick;
        delete next.from;
        delete next.to;
      } else {
        next.quick = key === 'new_today' ? 'today' : key === 'new_week' ? 'this_week' : 'this_month';
        delete next.from;
        delete next.to;
      }
      break;
    }
    case 'unread':
    case 'unanswered': {
      if (active) delete next.flag;
      else next.flag = key;
      break;
    }
    case 'hot':
    case 'warm':
    case 'cold': {
      if (active) delete next.temperature;
      else next.temperature = key;
      break;
    }
    default:
      break;
  }
  return next;
}

interface ConversationSummaryBarProps {
  summary: ConversationSearchSummary | undefined;
  isLoading: boolean;
  advFilters: ConversationAdvancedFilters;
  onAdvFiltersChange: (next: ConversationAdvancedFilters) => void;
}

// Small stat-tile strip reflecting the active filters — reporting summary from
// GET /api/conversations/search's `summary` object (see conversation.service.ts).
// Each tile is clickable: it applies the matching filter to the list above, toggling
// off on a second click.
export function ConversationSummaryBar({ summary, isLoading, advFilters, onAdvFiltersChange }: ConversationSummaryBarProps) {
  return (
    <div className="shrink-0 border-b border-border px-3 py-2">
      <div className="grid grid-cols-4 gap-1">
        {TILES.map((tile) => {
          const active = isTileActive(tile.key, advFilters);
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onAdvFiltersChange(toggleTileFilter(tile.key, advFilters))}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-md px-1 py-1.5 text-center transition-colors',
                active
                  ? 'bg-brand-500/10 ring-1 ring-inset ring-brand-500/50'
                  : 'bg-accent/50 hover:bg-accent',
              )}
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

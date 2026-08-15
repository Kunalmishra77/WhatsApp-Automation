'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Section header — matches the AnalyticsDashboard SectionHeader look (icon chip +
// title + optional sub-line), reused across CommandCenter's message/campaign sections.
// Pass `onClick` to make the whole header a lightweight drill-through link to the
// section's parent page — adds a hover affordance + chevron, keyboard-accessible.
export function SectionCard({
  icon: Icon, title, sub, color = 'text-brand-600', children, onClick,
}: {
  icon: React.ElementType;
  title: string;
  sub?: string;
  color?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const interactiveProps = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <div>
      <div
        {...interactiveProps}
        className={cn(
          'flex items-center gap-2 mb-3',
          onClick && 'group w-fit -m-1 cursor-pointer rounded-md p-1 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <div className={cn('h-7 w-7 rounded-lg bg-muted flex items-center justify-center')}>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1">
            {title}
            {onClick && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </h2>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

'use client';

import { cn } from '@/lib/utils';

// Section header — matches the AnalyticsDashboard SectionHeader look (icon chip +
// title + optional sub-line), reused across CommandCenter's message/campaign sections.
export function SectionCard({
  icon: Icon, title, sub, color = 'text-brand-600', children,
}: {
  icon: React.ElementType;
  title: string;
  sub?: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('h-7 w-7 rounded-lg bg-muted flex items-center justify-center')}>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

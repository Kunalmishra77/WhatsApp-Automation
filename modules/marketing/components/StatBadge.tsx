import { cn } from '@/lib/utils';

interface StatBadgeProps {
  value: string;
  label: string;
  className?: string;
  tone?: 'light' | 'dark';
}

export function StatBadge({ value, label, className, tone = 'dark' }: StatBadgeProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span
        className={cn(
          'font-display text-2xl font-bold sm:text-3xl',
          tone === 'dark' ? 'text-navy-900' : 'text-white'
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          'text-xs font-medium uppercase tracking-wide',
          tone === 'dark' ? 'text-navy-900/50' : 'text-white/50'
        )}
      >
        {label}
      </span>
    </div>
  );
}

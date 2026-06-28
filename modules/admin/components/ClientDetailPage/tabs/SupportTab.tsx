'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Props { workspaceId: string }

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-gray-100 text-gray-500',
};

const STATUS_STYLE: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-violet-100 text-violet-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-gray-100 text-gray-500',
};

interface Ticket {
  id:         string;
  title:      string;
  priority:   string;
  status:     string;
  created_at: string;
}

export function SupportTab({ workspaceId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'workspace', workspaceId, 'tickets'],
    queryFn:  () => fetch(`/api/admin/support-tickets?workspaceId=${workspaceId}`).then(r => r.json()),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const tickets: Ticket[] = data?.tickets ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
      </p>
      {tickets.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No support tickets</p>
      ) : (
        tickets.map((t) => (
          <div key={t.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-800">{t.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium', PRIORITY_STYLE[t.priority] ?? 'bg-gray-100 text-gray-500')}>
                  {t.priority}
                </span>
                <span className={cn('text-xs rounded-full px-2 py-0.5 font-medium', STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-500')}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

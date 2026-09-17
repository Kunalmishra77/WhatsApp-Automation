'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Lightbulb, RefreshCw, Star, MessageCircleQuestion, Snowflake, Inbox, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';

interface Action { id: string; type: string; priority: 1 | 2 | 3; title: string; detail: string; href: string }

const TYPE_ICON: Record<string, typeof Star> = {
  review: Star, question: MessageCircleQuestion, lead: Snowflake, conversation: Inbox,
};
const PRIORITY_META: Record<number, { label: string; cls: string; dot: string }> = {
  1: { label: 'Urgent', cls: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500' },
  2: { label: 'Soon', cls: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  3: { label: 'When free', cls: 'text-sky-700 bg-sky-50 border-sky-200', dot: 'bg-sky-500' },
};

export default function GrowthCopilotPage() {
  useRequirePageRole('growth-copilot');
  const router = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['growth-copilot', workspaceId],
    queryFn: () => fetch(`/api/growth-copilot?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const actions: Action[] = data?.actions ?? [];
  const summary = data?.summary ?? { total: 0, urgent: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-amber-500" /> Growth Copilot
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Your prioritised to-do across every channel — what to act on right now</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Header banner */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-6 text-white shadow-sm">
        {isLoading ? (
          <Skeleton className="h-8 w-48 bg-white/30" />
        ) : summary.total === 0 ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8" />
            <div>
              <p className="text-lg font-bold">All caught up! 🎉</p>
              <p className="text-white/80 text-sm">No pending actions right now. Great work.</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-3xl font-extrabold tabular-nums">{summary.total}</p>
            <p className="text-white/85">action{summary.total === 1 ? '' : 's'} to grow your business today
              {summary.urgent > 0 && <> · <span className="font-semibold">{summary.urgent} urgent</span></>}
            </p>
          </div>
        )}
      </div>

      {/* Action list */}
      <div className="space-y-2.5">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
        {!isLoading && actions.map((a) => {
          const Icon = TYPE_ICON[a.type] ?? Lightbulb;
          const p = PRIORITY_META[a.priority] ?? PRIORITY_META[2]!;
          return (
            <button
              key={a.id}
              onClick={() => router.push(a.href)}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:border-brand-200 transition-colors"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                <Icon className="h-5 w-5 text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} /> {p.label}
                  </span>
                  <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{a.detail}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Clock, User } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  assignee?: { full_name?: string | null; email?: string | null } | null;
}

interface Group {
  key: string;
  name: string;
  todo: number;
  in_progress: number;
  done: number;
  tasks: Task[];
}

const STATUS_META: Record<Task['status'], { icon: typeof Circle; cls: string; label: string }> = {
  todo:        { icon: Circle,       cls: 'text-slate-400',   label: 'To do' },
  in_progress: { icon: Clock,        cls: 'text-amber-500',   label: 'In progress' },
  done:        { icon: CheckCircle2, cls: 'text-emerald-500', label: 'Done' },
};

// Per-member view of assigned work — who owns what, and progress. Reuses the
// existing /api/tasks endpoint and groups client-side by assignee.
export function AssignedWork({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['team-assigned-work', workspaceId],
    queryFn: () => fetch(`/api/tasks?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
  });

  const groups = useMemo<Group[]>(() => {
    const tasks: Task[] = data?.tasks ?? [];
    const map = new Map<string, Group>();
    for (const t of tasks) {
      const key = t.assigned_to ?? 'unassigned';
      const name = t.assignee?.full_name ?? t.assignee?.email ?? 'Unassigned';
      let g = map.get(key);
      if (!g) { g = { key, name, todo: 0, in_progress: 0, done: 0, tasks: [] }; map.set(key, g); }
      g[t.status] += 1;
      g.tasks.push(t);
    }
    // Most active (most open work) first; Unassigned last.
    return [...map.values()].sort((a, b) => {
      if (a.key === 'unassigned') return 1;
      if (b.key === 'unassigned') return -1;
      return (b.todo + b.in_progress) - (a.todo + a.in_progress);
    });
  }, [data]);

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  if (groups.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">No tasks assigned yet. Create tasks from the Tasks page or a conversation.</p>;

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const open = g.todo + g.in_progress;
        return (
          <div key={g.key} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600"><User className="h-3.5 w-3.5" /></div>
                <span className="text-sm font-semibold text-foreground">{g.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="border-slate-200 text-slate-500">{g.todo} to do</Badge>
                <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">{g.in_progress} active</Badge>
                <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">{g.done} done</Badge>
              </div>
            </div>
            <div className="divide-y divide-border/60">
              {g.tasks.slice(0, 6).map((t) => {
                const m = STATUS_META[t.status];
                const Icon = m.icon;
                return (
                  <div key={t.id} className="flex items-center gap-2.5 px-4 py-2">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${m.cls}`} />
                    <span className={`flex-1 truncate text-xs ${t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{t.title}</span>
                    {t.due_date && <span className="text-[11px] text-muted-foreground">{new Date(t.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                );
              })}
              {g.tasks.length > 6 && <p className="px-4 py-2 text-[11px] text-muted-foreground">+{g.tasks.length - 6} more · {open} open total</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

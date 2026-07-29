'use client';

import { Trash2, User, CalendarClock, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { isOverdue } from '@/lib/tasks';
import { useTaskMutations, type Task } from '../../hooks/useTasks';

const PRIORITY_STYLES: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-slate-100 text-slate-600',
};
const NEXT_STATUS: Record<Task['status'], Task['status']> = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
const STATUS_LABEL: Record<Task['status'], string> = { todo: 'Start', in_progress: 'Complete', done: 'Reopen' };

export function TaskCard({ task }: { task: Task }) {
  const { update, remove } = useTaskMutations();
  const overdue = isOverdue(task.due_date, task.status, Date.now());
  const assignee = task.assignee?.full_name ?? task.assignee?.email ?? 'Unassigned';

  const advance = () => update.mutate(
    { id: task.id, status: NEXT_STATUS[task.status] },
    { onError: (e) => toast.error((e as Error).message) },
  );
  const del = () => {
    if (!confirm('Delete this task?')) return;
    remove.mutate(task.id, { onError: (e) => toast.error((e as Error).message) });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
          {task.title}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.low}`}>
          {task.priority}
        </span>
      </div>

      {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {assignee}</span>
        {task.due_date && (
          <span className={`inline-flex items-center gap-1 ${overdue ? 'font-semibold text-red-600' : ''}`}>
            <CalendarClock className="h-3 w-3" /> {new Date(task.due_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            {overdue && ' (overdue)'}
          </span>
        )}
        {task.related_conversation_id && (
          <Link href={`/conversations?c=${task.related_conversation_id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
            <MessageSquare className="h-3 w-3" /> {task.contact?.name ?? 'Chat'}
          </Link>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <button
          onClick={advance}
          disabled={update.isPending}
          className="rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {STATUS_LABEL[task.status]}
        </button>
        <button onClick={del} disabled={remove.isPending} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

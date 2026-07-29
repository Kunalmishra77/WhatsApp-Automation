'use client';

import { useState } from 'react';
import { Plus, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTasks, useTeamMembers, type Task } from '../../hooks/useTasks';
import { TaskCard } from '../TaskCard';
import { NewTaskDialog } from '../NewTaskDialog';

const COLUMNS: Array<{ key: Task['status']; label: string }> = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

export function TaskBoard() {
  const [assignee, setAssignee] = useState('');
  const [showNew, setShowNew] = useState(false);
  const { data: tasks = [], isLoading } = useTasks(assignee || undefined);
  const { data: members = [] } = useTeamMembers();

  const byStatus = (s: Task['status']) => tasks.filter((t) => t.status === s);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-3">
        <h1 className="text-base font-semibold text-foreground">Tasks</h1>
        <div className="flex items-center gap-2">
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">All assignees</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.email ?? 'Member'}</option>
            ))}
          </select>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> New Task
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 overflow-y-auto p-6 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = byStatus(col.key);
          return (
            <div key={col.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-sm font-semibold text-foreground">{col.label}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{items.length}</span>
              </div>
              {isLoading ? (
                <p className="px-1 text-xs text-muted-foreground">Loading…</p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border py-8 text-center">
                  <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">No tasks</p>
                </div>
              ) : (
                items.map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </div>
          );
        })}
      </div>

      {showNew && <NewTaskDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

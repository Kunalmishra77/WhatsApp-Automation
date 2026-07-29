'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTaskMutations, useTeamMembers } from '../../hooks/useTasks';

export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const { create } = useTaskMutations();
  const { data: members = [] } = useTeamMembers();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('A task title is required'); return; }
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_to: assignedTo || null,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      },
      {
        onSuccess: () => { toast.success('Task created'); onClose(); },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">New Task</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-title">Title</Label>
          <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call back Priya about pricing" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-desc">Description (optional)</Label>
          <textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-assignee">Assign to</Label>
            <select id="t-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.email ?? 'Member'}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-priority">Priority</Label>
            <select id="t-priority" value={priority} onChange={(e) => setPriority(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-due">Due date (optional)</Label>
          <Input id="t-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={create.isPending} className="bg-brand-500 text-white hover:bg-brand-600">
            {create.isPending ? 'Creating…' : 'Create Task'}
          </Button>
        </div>
      </form>
    </div>
  );
}

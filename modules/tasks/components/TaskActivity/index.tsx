'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, MessageCircle, GitCommitHorizontal, UserPlus, Flag, Clock } from 'lucide-react';

interface Activity {
  id: string;
  type: 'comment' | 'status_change' | 'assignment' | 'created' | 'due_change';
  body: string | null;
  created_at: string;
  actor?: { full_name?: string | null; email?: string | null } | null;
}

const ICONS: Record<Activity['type'], typeof MessageCircle> = {
  comment: MessageCircle,
  status_change: GitCommitHorizontal,
  assignment: UserPlus,
  created: Flag,
  due_change: Clock,
};

// Inline activity + comment thread for one task. Fetches on mount (only rendered
// when the card's Activity section is open), lists the history, and lets a team
// member post an update. Status/assignment/due changes are logged server-side.
export function TaskActivity({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}/activity`).then((r) => r.json()),
  });
  const activity: Activity[] = data?.activity ?? [];

  async function addComment() {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? 'Failed to add comment'); return; }
      setText('');
      void qc.invalidateQueries({ queryKey: ['task-activity', taskId] });
    } catch {
      toast.error('Could not add comment');
    } finally { setPosting(false); }
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
      <div className="max-h-44 space-y-2 overflow-y-auto">
        {isLoading && <p className="text-[11px] text-muted-foreground">Loading…</p>}
        {!isLoading && activity.length === 0 && <p className="text-[11px] text-muted-foreground">No activity yet.</p>}
        {activity.map((a) => {
          const Icon = ICONS[a.type] ?? MessageCircle;
          const who = a.actor?.full_name ?? a.actor?.email ?? 'Someone';
          const when = new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          return (
            <div key={a.id} className="flex gap-2">
              <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${a.type === 'comment' ? 'text-brand-500' : 'text-muted-foreground'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-foreground/90 break-words">
                  {a.type === 'comment' ? a.body : <span className="text-muted-foreground">{a.body}</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">{who} · {when}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !posting) { e.preventDefault(); void addComment(); } }}
          placeholder="Add an update…"
          className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:border-brand-400"
        />
        <button
          onClick={() => void addComment()}
          disabled={posting || !text.trim()}
          className="inline-flex h-7 items-center rounded-md bg-brand-500 px-2 text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

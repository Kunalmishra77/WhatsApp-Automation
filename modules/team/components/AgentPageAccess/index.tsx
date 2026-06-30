'use client';

import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAgentPageAccess } from '@/hooks/useAgentPageAccess';
import { useQueryClient } from '@tanstack/react-query';
import { AGENT_RESTRICTABLE_PAGES, type AgentPageKey } from '@/lib/agent-pages';

// Lets an admin/manager decide exactly which platform pages the 'agent' role
// can see, beyond the always-on core surface (Dashboard, Conversations,
// Contacts). Backed by workspaces.settings.agent_page_access — read by both
// the Sidebar (show/hide nav) and every restricted page's server/client guard.
export function AgentPageAccess() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient  = useQueryClient();
  const { data: allowed, isLoading } = useAgentPageAccess();

  const [selected, setSelected] = useState<Set<AgentPageKey>>(new Set());
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (allowed) setSelected(new Set(allowed));
  }, [allowed]);

  const toggle = (key: AgentPageKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/team/page-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, agentPageAccess: [...selected] }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Page access updated for Support Agents');
      void queryClient.invalidateQueries({ queryKey: ['agent-page-access', workspaceId] });
    } catch {
      toast.error('Failed to save page access');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 shrink-0">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Support Agent page access</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Agents always see Conversations, Contacts, and their own Dashboard summary — assigned chats and leads only.
            Choose which additional pages they can open. Unchecked pages are hidden from the sidebar and blocked if visited directly.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border divide-y divide-border">
        {AGENT_RESTRICTABLE_PAGES.map((page) => (
          <label
            key={page.key}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
          >
            <Checkbox
              checked={selected.has(page.key)}
              onCheckedChange={() => toggle(page.key)}
            />
            <span className="text-sm font-medium text-foreground">{page.label}</span>
          </label>
        ))}
      </div>

      <Button size="sm" className="gap-1.5" onClick={() => void save()} disabled={saving}>
        <Save className="h-3.5 w-3.5" />
        {saving ? 'Saving…' : 'Save Page Access'}
      </Button>
    </div>
  );
}

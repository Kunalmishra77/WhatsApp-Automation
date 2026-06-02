'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Info } from 'lucide-react';
import { toast } from 'sonner';

interface TimeTriggerConfig {
  idle_close_enabled: boolean;
  idle_close_hours:   number;
  idle_message:       string | null;
}

export function TimeTriggerSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();

  const [enabled, setEnabled]  = useState(false);
  const [hours,   setHours]    = useState(24);
  const [message, setMessage]  = useState('');

  const { data, isLoading } = useQuery<TimeTriggerConfig>({
    queryKey: ['time-trigger-config', workspaceId],
    queryFn:  () =>
      fetch(`/api/time-trigger-config?workspaceId=${workspaceId}`).then(
        (r) => r.json() as Promise<TimeTriggerConfig>,
      ),
    enabled: !!workspaceId,
  });

  useEffect(() => {
    if (data) {
      setEnabled(data.idle_close_enabled ?? false);
      setHours(data.idle_close_hours ?? 24);
      setMessage(data.idle_message ?? '');
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      fetch('/api/time-trigger-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          idle_close_enabled: enabled,
          idle_close_hours:   hours,
          idle_message:       message.trim() || null,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-trigger-config', workspaceId] });
      toast.success('Settings saved');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Time-Based Automation</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automatically take actions on conversations based on inactivity.
        </p>
      </div>

      {/* Idle auto-close */}
      <div className="rounded-xl border border-border p-4 space-y-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Auto-close idle conversations</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Resolve conversations that have had no activity for X hours
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="idle-hours">Close after (hours)</Label>
              <Input
                id="idle-hours"
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Conversations with no messages for {hours}h will be auto-resolved.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="idle-msg">Closing message (optional)</Label>
              <Textarea
                id="idle-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. This conversation has been closed due to inactivity. Feel free to message us anytime!"
                className="resize-none h-20 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Sent to the contact before the conversation is resolved.
              </p>
            </div>
          </>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            The cron job runs hourly. Conversations are queued and then closed with a 30-minute grace window. You can also schedule per-conversation actions via the API.
          </p>
        </div>
      </div>

      <Button onClick={() => void save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  );
}

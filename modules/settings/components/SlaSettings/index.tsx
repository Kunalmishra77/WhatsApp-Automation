'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Timer, Loader2, Save, AlertTriangle } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';

export function SlaSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [firstResponseHours, setFirstResponseHours] = useState('1');
  const [resolutionHours, setResolutionHours] = useState('24');
  const [breachNotifyAgents, setBreachNotifyAgents] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/sla?workspaceId=${workspaceId}`);
        const data = await res.json() as { policy?: { is_enabled: boolean; first_response_hours: number; resolution_hours: number; breach_notify_agents: boolean } };
        if (data.policy) {
          setIsEnabled(data.policy.is_enabled);
          setFirstResponseHours(String(data.policy.first_response_hours));
          setResolutionHours(String(data.policy.resolution_hours));
          setBreachNotifyAgents(data.policy.breach_notify_agents);
        }
      } finally { setIsLoading(false); }
    })();
  }, [workspaceId]);

  const handleSave = async () => {
    if (!workspaceId) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          isEnabled,
          firstResponseHours: parseFloat(firstResponseHours) || 1,
          resolutionHours:    parseFloat(resolutionHours) || 24,
          breachNotifyAgents,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('SLA policy saved');
    } catch { toast.error('Failed to save'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Timer className="h-5 w-5 text-brand-500" />
            SLA Management
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set response time targets. Breached conversations get flagged automatically.
          </p>
        </div>
        <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save</>}
        </Button>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Enable SLA Tracking</p>
          <p className="text-xs text-muted-foreground mt-0.5">When on, conversations that breach SLA targets get flagged with a warning indicator.</p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
      </div>

      {/* Targets */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <p className="text-sm font-medium">First Response Time</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0.5"
              step="0.5"
              value={firstResponseHours}
              onChange={(e) => setFirstResponseHours(e.target.value)}
              className="w-24 h-8 text-sm"
            />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
          <p className="text-xs text-muted-foreground">Time until first agent reply. 1 = 1 hour, 0.5 = 30 min.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-400" />
            <p className="text-sm font-medium">Resolution Time</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              step="1"
              value={resolutionHours}
              onChange={(e) => setResolutionHours(e.target.value)}
              className="w-24 h-8 text-sm"
            />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
          <p className="text-xs text-muted-foreground">Time until conversation is resolved. 24 = 1 day.</p>
        </div>
      </div>

      {/* Notifications */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Notify agents on breach
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Send in-app notification to all agents when SLA is breached.</p>
        </div>
        <Switch checked={breachNotifyAgents} onCheckedChange={setBreachNotifyAgents} />
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">How it works</p>
        <p>• Cron job runs every hour to check for breached conversations</p>
        <p>• First response breach: conversation opened but no agent reply within target time</p>
        <p>• Resolution breach: conversation still open past resolution target</p>
        <p>• Breached conversations show a <span className="text-red-500 font-medium">⚠️ red badge</span> in the inbox</p>
      </div>
    </div>
  );
}

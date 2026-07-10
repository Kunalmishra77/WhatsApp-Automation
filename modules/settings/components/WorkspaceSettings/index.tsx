'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceStore } from '@/store/workspace.store';
import { createClient } from '@/services/supabase/client';
import { toast } from 'sonner';
import { Monitor, Smartphone, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2).max(100),
});
type FormValues = z.infer<typeof schema>;

interface SessionRow {
  id:           string;
  user_agent:   string | null;
  ip_address:   string | null;
  created_at:   string;
  last_seen_at: string;
  isCurrent:    boolean;
}

function friendlyAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'Mobile browser';
  if (/chrome/i.test(ua))  return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua))  return 'Safari';
  if (/edge/i.test(ua))    return 'Edge';
  return 'Browser';
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ActiveSessions({ workspaceId }: { workspaceId: string }) {
  const [sessions,  setSessions]  = useState<SessionRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [revoking,  setRevoking]  = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/session/list?workspaceId=${workspaceId}`);
      const d = await r.json() as { sessions?: SessionRow[]; error?: string };
      if (r.ok) setSessions(d.sessions ?? []);
      else toast.error(d.error ?? 'Failed to load sessions');
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      const r = await fetch(`/api/session/${id}?workspaceId=${workspaceId}`, { method: 'DELETE' });
      if (r.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        toast.success('Session revoked');
      } else {
        const d = await r.json() as { error?: string };
        toast.error(d.error ?? 'Failed to revoke');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sessions.length === 0 && !loading ? 'No active sessions found.' : `${sessions.length} active session(s)`}
        </p>
        <button
          onClick={fetchSessions}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isMobile = /mobile|android|iphone|ipad/i.test(s.user_agent ?? '');
            const DeviceIcon = isMobile ? Smartphone : Monitor;
            return (
              <div
                key={s.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border border-border p-3',
                  s.isCurrent && 'border-brand-300 bg-brand-50/40 dark:bg-brand-900/10',
                )}
              >
                <div className="flex items-center gap-3">
                  <DeviceIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {friendlyAgent(s.user_agent)}
                      {s.isCurrent && (
                        <span className="ml-2 text-[10px] font-semibold text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Active {timeAgo(s.last_seen_at)}
                      {s.ip_address ? ` · ${s.ip_address}` : ''}
                    </p>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => revoke(s.id)}
                    disabled={revoking === s.id}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    {revoking === s.id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkspaceSettings() {
  const workspace        = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role             = (workspace as any)?.role as string | undefined;
  const isPrivileged     = role === 'super_admin' || role === 'admin';

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { name: workspace?.name ?? '' },
    });

  const onSubmit = async (values: FormValues) => {
    if (!workspace) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { error } = await supabase
      .from('workspaces')
      .update({ name: values.name })
      .eq('id', workspace.id);
    if (error) {
      toast.error('Failed to update workspace');
    } else {
      setActiveWorkspace({ ...workspace, name: values.name });
      toast.success('Workspace updated');
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Workspace</h2>
        <p className="text-sm text-muted-foreground">Update your workspace name and details.</p>
      </div>
      <Separator />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Workspace Name</Label>
          <Input id="ws-name" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>URL Slug</Label>
          <Input value={workspace?.slug ?? ''} disabled className="bg-muted font-mono text-sm" />
          <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Input value={workspace?.plan ?? 'starter'} disabled className="bg-muted text-sm capitalize" />
        </div>
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>

      {isPrivileged && workspace && (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Active Sessions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                These are the browsers/devices currently logged into this workspace.
              </p>
            </div>
            <ActiveSessions workspaceId={workspace.id} />
          </div>
        </>
      )}
    </div>
  );
}

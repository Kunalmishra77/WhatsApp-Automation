'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, Lock, Unlock, Trash2 } from 'lucide-react';

interface Props {
  workspaceId: string;
  workspace:   Record<string, unknown>;
}

export function SettingsTab({ workspaceId, workspace }: Props) {
  const qc = useQueryClient();
  const [plan,   setPlan]   = useState((workspace.plan as string) ?? 'starter');
  const [domain, setDomain] = useState((workspace.custom_domain as string) ?? '');

  const updateMut = useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (body) =>
      fetch(`/api/admin/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: (_data, variables) => {
      if (variables.is_active !== undefined) {
        toast.success(variables.is_active ? 'Workspace unblocked' : 'Workspace blocked');
      } else if (variables.deleted_at !== undefined) {
        toast.success('Workspace moved to trash');
      } else {
        toast.success('Saved!');
      }
      qc.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const isBlocked = !workspace.is_active;

  return (
    <div className="space-y-6 max-w-lg">
      {/* Subscription Plan */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Subscription Plan</h3>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['free', 'starter', 'pro', 'enterprise'].map(p => (
              <SelectItem key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="text-xs text-white"
          style={{ backgroundColor: '#F97316' }}
          disabled={updateMut.isPending}
          onClick={() => updateMut.mutate({ plan })}
        >
          Update Plan
        </Button>
      </div>

      {/* Custom Domain */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Custom Domain</h3>
        <div>
          <Label className="text-xs text-gray-500">Domain</Label>
          <Input
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="app.clientdomain.com"
            className="mt-1 h-8 text-xs"
          />
          {domain && (
            <p className="text-xs text-gray-400 mt-1">
              Point a CNAME record to <code className="bg-gray-100 px-1 rounded">agentix-cname.vercel.app</code>
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          disabled={updateMut.isPending}
          onClick={() => updateMut.mutate({ custom_domain: domain.trim() || null })}
        >
          Save Domain
        </Button>
      </div>

      {/* Subscription Status */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Subscription Status</h3>
        <div className="flex gap-2 flex-wrap">
          {['active', 'trialing', 'halted', 'cancelled', 'pending_approval'].map(s => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              className={`text-xs ${workspace.subscription_status === s ? 'border-orange-400 text-orange-600 bg-orange-50' : ''}`}
              disabled={updateMut.isPending || workspace.subscription_status === s}
              onClick={() => updateMut.mutate({ subscription_status: s })}
            >
              {s.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Danger Zone
        </h3>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className={isBlocked
              ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
              : 'border-red-200 text-red-700 hover:bg-red-50'}
            disabled={updateMut.isPending}
            onClick={() => updateMut.mutate({ is_active: isBlocked })}
          >
            {isBlocked
              ? <><Unlock className="h-3.5 w-3.5 mr-1" /> Unblock Workspace</>
              : <><Lock className="h-3.5 w-3.5 mr-1" /> Block Workspace</>}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            disabled={updateMut.isPending}
            onClick={() => {
              if (confirm('Move workspace to trash? It can be restored within 7 days.')) {
                updateMut.mutate({ deleted_at: new Date().toISOString() });
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

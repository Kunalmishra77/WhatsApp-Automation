'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, Lock, Unlock, Trash2, CreditCard } from 'lucide-react';

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
      {/* What the client can actually open */}
      <PlanAndAddonsSection workspaceId={workspaceId} />

      {/* Feature tier — the older, separate gate */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Feature tier</h3>
        <p className="text-xs text-gray-500">
          Gates Flows and CRM only. Separate from the plan above, which controls the
          WhatsApp, Instagram and Google sections in the client&apos;s sidebar.
        </p>
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

      {/* Payment gateway (billing enforcement) */}
      <PaymentGatewaySection workspaceId={workspaceId} />

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
              Point a CNAME record to <code className="bg-gray-100 px-1 rounded">app.aiagentixdev.com</code>
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

// Per-client payment gateway toggle. ON = billing enforced (trial/renewal/suspension
// apply). OFF = comped (free, billing sweep skips). Works for existing or new clients.
interface BillingState {
  comped: boolean;
  plan_key: string | null;
  has_instagram: boolean;
  has_google_growth: boolean;
  has_subscription: boolean;
}

// The control that decides what the client can actually open. It writes to the
// subscription, which is what the sidebar reads — the "Feature tier" dropdown
// above writes a different, older field and does not affect any of this.
function PlanAndAddonsSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<BillingState>({
    queryKey: ['admin', 'workspace-billing', workspaceId],
    queryFn: () => fetch(`/api/admin/workspaces/${workspaceId}/billing`).then(r => r.json()),
  });

  const mut = useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (body) =>
      fetch(`/api/admin/workspaces/${workspaceId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed'); return d; }),
    onSuccess: () => {
      toast.success('Plan updated — the client sees it on their next page load');
      qc.invalidateQueries({ queryKey: ['admin', 'workspace-billing', workspaceId] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !data) return null;

  const allInOne = data.plan_key === 'all_in_one';
  const instagram = allInOne || data.has_instagram;
  const google    = allInOne || data.has_google_growth;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Plan &amp; add-ons</h3>

      {data.comped ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          This client is comped, so every section is already unlocked. Switch the
          payment gateway on below to charge them, then choose a plan here.
        </div>
      ) : (
        <>
          <Select
            value={data.plan_key ?? 'core'}
            onValueChange={(v) => mut.mutate({ plan_key: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="core">Core — WhatsApp only (₹2,999)</SelectItem>
              <SelectItem value="all_in_one">All-in-One — everything (₹4,999)</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
            <div className="pr-3">
              <p className="text-sm font-medium text-gray-800">Instagram add-on</p>
              <p className="text-xs text-gray-500 mt-0.5">DM auto-reply, comment reply (+₹999)</p>
            </div>
            <Switch
              checked={instagram}
              disabled={allInOne || mut.isPending}
              onCheckedChange={(v) => mut.mutate({ has_instagram: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
            <div className="pr-3">
              <p className="text-sm font-medium text-gray-800">Google Growth add-on</p>
              <p className="text-xs text-gray-500 mt-0.5">Business Profile, Google Ads, Local Rank (+₹999)</p>
            </div>
            <Switch
              checked={google}
              disabled={allInOne || mut.isPending}
              onCheckedChange={(v) => mut.mutate({ has_google_growth: v })}
            />
          </div>

          {allInOne && (
            <p className="text-xs text-gray-500">
              All-in-One already includes both add-ons. Switch to Core to control them separately.
            </p>
          )}
          {!data.has_subscription && (
            <p className="text-xs text-gray-500">
              This client has never checked out — choosing anything here creates their subscription.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PaymentGatewaySection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'workspace-billing', workspaceId],
    queryFn: () => fetch(`/api/admin/workspaces/${workspaceId}/billing`).then((r) => r.json()),
  });
  const comped: boolean = data?.comped ?? false;
  const enforced = !comped;

  const mut = useMutation<unknown, Error, boolean>({
    mutationFn: (nextEnforced) =>
      fetch(`/api/admin/workspaces/${workspaceId}/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comped: !nextEnforced }),
      }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed'); return d; }),
    onSuccess: (_d, nextEnforced) => {
      toast.success(nextEnforced ? 'Payment gateway enabled for this client' : 'Payment gateway removed — client is now free (comped)');
      qc.invalidateQueries({ queryKey: ['admin', 'workspace-billing', workspaceId] });
      qc.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <CreditCard className="h-4 w-4" /> Payment Gateway
      </h3>
      <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
        <div className="pr-3">
          <p className="text-sm font-medium text-gray-800">{enforced ? 'Billing enforced' : 'Comped (free)'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {enforced
              ? 'This client is charged — trial, renewal and suspension apply.'
              : 'This client uses the product free — the billing sweep skips it.'}
          </p>
        </div>
        <Switch checked={enforced} disabled={mut.isPending} onCheckedChange={(v) => mut.mutate(v)} />
      </div>
    </div>
  );
}

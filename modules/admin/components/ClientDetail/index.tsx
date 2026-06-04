'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getLimits } from '@/lib/plan-features';
import type { WorkspaceRow } from '@/app/api/admin/workspaces/route';

interface ClientDetailProps {
  workspace: WorkspaceRow;
  onClose: () => void;
  onRefetch: () => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function StatCard({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit?: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-center space-y-0.5">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="text-xl font-bold text-foreground tabular-nums">
        {value.toLocaleString('en-IN')}
      </div>
      {limit !== undefined && (
        <div className="text-xs text-muted-foreground">
          /{limit.toLocaleString('en-IN')}
        </div>
      )}
    </div>
  );
}

export function ClientDetail({ workspace: w, onClose, onRefetch }: ClientDetailProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showWaForm, setShowWaForm]       = useState(false);
  const [waPhone, setWaPhone]             = useState((w as any).phone_number_id ?? '');
  const [waToken, setWaToken]             = useState('');
  const [waWaba,  setWaWaba]              = useState((w as any).waba_id ?? '');
  const limits = getLimits(w.plan);

  const handleSaveWhatsApp = async () => {
    if (!waPhone.trim() || !waToken.trim()) {
      toast.error('Phone Number ID and Access Token are required');
      return;
    }
    setPendingAction('wa');
    try {
      await patchWorkspace({
        phone_number_id:     waPhone.trim(),
        access_token:        waToken.trim(),
        waba_id:             waWaba.trim() || null,
        onboarding_complete: true,
      }, `WhatsApp credentials saved for ${w.name}`);
      setShowWaForm(false);
      setWaToken('');
    } catch {
      toast.error('Failed to save WhatsApp credentials');
    } finally {
      setPendingAction(null);
    }
  };

  const patchWorkspace = async (body: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/admin/workspaces/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed');
    toast.success(successMsg);
    onRefetch();
  };

  const handleApprove = async () => {
    setPendingAction('approve');
    try {
      await patchWorkspace({ subscription_status: 'active' }, `${w.name} approved and activated`);
      onClose();
    } catch {
      toast.error('Failed to approve workspace');
    } finally {
      setPendingAction(null);
    }
  };

  const handleBlock = async () => {
    setPendingAction('block');
    try {
      const newActive = !w.is_active;
      await patchWorkspace(
        { is_active: newActive },
        newActive ? `${w.name} unblocked` : `${w.name} blocked`,
      );
      onClose();
    } catch {
      toast.error('Failed to update workspace');
    } finally {
      setPendingAction(null);
    }
  };

  const handleChangePlan = async (newPlan: string) => {
    if (newPlan === w.plan) return;
    setPendingAction('plan');
    try {
      await patchWorkspace({ plan: newPlan }, `${w.name} plan changed to ${newPlan}`);
    } catch {
      toast.error('Failed to change plan');
    } finally {
      setPendingAction(null);
    }
  };

  const statusLabel = (() => {
    if (w.subscription_status === 'pending_approval') return { text: 'Pending Approval', cls: 'bg-orange-50 text-orange-600 border-orange-200' };
    if (!w.is_active) return { text: 'Blocked', cls: 'bg-red-50 text-red-600 border-red-200' };
    if (w.subscription_status === 'halted') return { text: 'Halted', cls: 'bg-orange-50 text-orange-600 border-orange-200' };
    if (w.subscription_status === 'trialing') return { text: 'Trial', cls: 'bg-sky-50 text-sky-600 border-sky-200' };
    return { text: 'Active', cls: 'bg-green-50 text-green-600 border-green-200' };
  })();

  const isPending = w.subscription_status === 'pending_approval';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{w.name}</DialogTitle>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Badge variant="outline" className="text-xs font-semibold capitalize">
              {w.plan.toUpperCase()}
            </Badge>
            <Badge variant="outline" className={`text-xs ${statusLabel.cls}`}>
              {statusLabel.text}
            </Badge>
            <span className="text-xs text-muted-foreground">Since {formatDate(w.created_at)}</span>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Monthly stats */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              This Month Stats
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="Messages"
                value={w.messages_this_month}
                limit={limits.maxMessages}
              />
              <StatCard
                label="Contacts"
                value={w.contacts_count}
                limit={limits.maxContacts}
              />
              <StatCard
                label="Members"
                value={w.member_count}
              />
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Contacts:</span>
                <span className="font-medium text-foreground">
                  {w.contacts_count.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Conversations:</span>
                <span className="font-medium text-foreground">
                  {w.conversations_count.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Members:</span>
                <span className="font-medium text-foreground">{w.member_count}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>Custom Domain:</span>
                <span className="font-medium text-foreground">
                  {w.custom_domain ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Owner info */}
          <div className="rounded-lg border px-4 py-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-28 shrink-0">Owner:</span>
              <span className="font-medium text-foreground truncate">{w.owner_email ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-28 shrink-0">WhatsApp:</span>
              {(w as any).phone_number_id ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <Wifi className="h-3.5 w-3.5" /> Connected ({(w as any).phone_number_id})
                </span>
              ) : (
                <span className="text-red-500 font-medium flex items-center gap-1">
                  <WifiOff className="h-3.5 w-3.5" /> Not configured
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-28 shrink-0">Custom Domain:</span>
              <span className="font-medium text-foreground">{w.custom_domain ?? '—'}</span>
            </div>
          </div>

          {/* WhatsApp Credentials Form */}
          {showWaForm ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-blue-800">WhatsApp Business Credentials</p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Phone Number ID *</Label>
                  <Input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="e.g. 1173335072523347" className="text-xs h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Permanent Access Token *</Label>
                  <Input value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder="EAAVyl..." type="password" className="text-xs h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp Business Account ID</Label>
                  <Input value={waWaba} onChange={(e) => setWaWaba(e.target.value)} placeholder="e.g. 1708964607185517" className="text-xs h-8" />
                </div>
              </div>
              <p className="text-[11px] text-blue-700">
                Webhook URL to give client: <code className="bg-blue-100 px-1 rounded">https://app.aiagentixdev.com/api/webhooks/whatsapp</code>
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={() => void handleSaveWhatsApp()} disabled={pendingAction === 'wa'}>
                  {pendingAction === 'wa' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save & Activate'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowWaForm(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 w-full border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => setShowWaForm(true)}>
              <Wifi className="h-3.5 w-3.5" />
              {(w as any).phone_number_id ? 'Update WhatsApp Credentials' : 'Set WhatsApp Credentials (Required)'}
            </Button>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {/* Change plan */}
            <div className="w-36">
              {pendingAction === 'plan' ? (
                <div className="flex items-center justify-center h-9">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select
                  value={w.plan}
                  onValueChange={(val) => void handleChangePlan(val)}
                  disabled={!!pendingAction}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Block / Unblock */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1"
              onClick={() => void handleBlock()}
              disabled={!!pendingAction}
            >
              {pendingAction === 'block' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : w.is_active ? (
                'Block'
              ) : (
                'Unblock'
              )}
            </Button>

            {/* Approve (shown when pending) */}
            {isPending && (
              <Button
                size="sm"
                className="h-9 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => void handleApprove()}
                disabled={!!pendingAction}
              >
                {pendingAction === 'approve' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Approve'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

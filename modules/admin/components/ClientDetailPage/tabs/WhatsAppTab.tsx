'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Copy, CheckCircle2, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  workspaceId: string;
  workspace:   Record<string, unknown>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <Input value={value || '—'} readOnly className="h-8 text-xs font-mono bg-gray-50" />
        {value && (
          <button onClick={copy} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0">
            {copied
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <Copy className="h-4 w-4 text-gray-400" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function WhatsAppTab({ workspaceId, workspace }: Props) {
  const qc = useQueryClient();
  const [creds, setCreds] = useState({
    phone_number_id: (workspace.phone_number_id as string) ?? '',
    access_token:    (workspace.access_token as string)    ?? '',
    waba_id:         (workspace.waba_id as string)         ?? '',
    agent_persona:   ((workspace.settings as Record<string, unknown>)?.agent_persona as string) ?? '',
  });

  const saveMut = useMutation({
    mutationFn: (body: object) =>
      fetch(`/api/admin/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      toast.success('Saved!');
      qc.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId] });
    },
    onError: () => toast.error('Save failed'),
  });

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://app.aiagentixdev.com'}/api/webhooks/whatsapp`;
  const isConnected = !!(workspace.phone_number_id && workspace.access_token);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Connection Status */}
      <div className={cn('flex items-center gap-3 p-4 rounded-xl border',
        isConnected ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200')}>
        {isConnected
          ? <Wifi className="h-5 w-5 text-emerald-600" />
          : <WifiOff className="h-5 w-5 text-red-500" />}
        <div>
          <p className={cn('text-sm font-semibold', isConnected ? 'text-emerald-700' : 'text-red-700')}>
            {isConnected ? 'WhatsApp Connected' : 'Not Connected — Fill credentials below'}
          </p>
          {isConnected && (
            <p className="text-xs text-emerald-600">Phone ID: {String(workspace.phone_number_id ?? '')}</p>
          )}
        </div>
      </div>

      {/* API Credentials */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">API Credentials</h3>
        <div>
          <Label className="text-xs text-gray-500">Phone Number ID</Label>
          <Input
            value={creds.phone_number_id}
            onChange={e => setCreds(s => ({ ...s, phone_number_id: e.target.value }))}
            placeholder="918XXXXXXXXXX"
            className="mt-1 h-8 text-xs font-mono"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Permanent Access Token</Label>
          <Input
            value={creds.access_token}
            onChange={e => setCreds(s => ({ ...s, access_token: e.target.value }))}
            type="password"
            placeholder="EAA..."
            className="mt-1 h-8 text-xs font-mono"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500">WABA ID</Label>
          <Input
            value={creds.waba_id}
            onChange={e => setCreds(s => ({ ...s, waba_id: e.target.value }))}
            placeholder="136XXXXXXXXXXXX"
            className="mt-1 h-8 text-xs font-mono"
          />
        </div>
        <Button
          size="sm"
          className="text-white text-xs"
          style={{ backgroundColor: '#F97316' }}
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate({
            phone_number_id: creds.phone_number_id || null,
            access_token:    creds.access_token    || null,
            waba_id:         creds.waba_id         || null,
          })}
        >
          {saveMut.isPending ? 'Saving...' : 'Save Credentials'}
        </Button>
      </div>

      {/* Webhook Configuration */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Webhook Configuration</h3>
        <CopyField
          label="Callback URL (set this in Meta App → WhatsApp → Configuration)"
          value={webhookUrl}
        />
        <CopyField label="Verify Token" value="agentix-webhook-secret-2026" />
        <div className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-lg p-3">
          ⓘ Subscribe to <strong>messages</strong> field in Meta App webhooks. Both incoming messages and delivery status come through this endpoint.
        </div>
      </div>

      {/* AI Bot Persona */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">AI Bot Persona</h3>
        <Textarea
          value={creds.agent_persona}
          onChange={e => setCreds(s => ({ ...s, agent_persona: e.target.value }))}
          placeholder="You are Riya, a helpful assistant for [Business Name]..."
          className="min-h-[200px] text-xs font-mono"
        />
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate({ settings: { agent_persona: creds.agent_persona } })}
        >
          {saveMut.isPending ? 'Saving...' : 'Save Persona'}
        </Button>
      </div>
    </div>
  );
}

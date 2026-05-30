'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';

export function WhatsAppSettings() {
  const workspace = useWorkspaceStore((s) => s.activeWorkspace);
  const isConfigured = !!(workspace?.waba_id && workspace.phone_number_id);

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">WhatsApp Business API</h2>
        <p className="text-sm text-muted-foreground">WhatsApp Business Account (WABA) configuration.</p>
      </div>
      <Separator />

      <div className="flex items-center gap-2">
        {isConfigured ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Connected</Badge>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <Badge className="bg-amber-100 text-amber-700 text-xs">Not configured</Badge>
          </>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>WABA ID</Label>
          <Input value={workspace?.waba_id ?? ''} disabled className="bg-muted font-mono text-sm" placeholder="Not set" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone Number ID</Label>
          <Input value={workspace?.phone_number_id ?? ''} disabled className="bg-muted font-mono text-sm" placeholder="Not set" />
        </div>
        <p className="text-xs text-muted-foreground">
          WABA credentials are set via environment variables. Contact your admin to update them.
        </p>
      </div>
    </div>
  );
}

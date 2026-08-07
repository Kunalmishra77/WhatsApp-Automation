'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Tag, Loader2, Save, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfferShape {
  name?: string; details?: string; valid_from?: string; valid_until?: string;
}

type OfferStatus = 'Active' | 'Scheduled' | 'Expired' | 'None';

function statusOf(o: OfferShape | null): OfferStatus {
  if (!o?.name || !o?.details) return 'None';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (o.valid_from && o.valid_from > today) return 'Scheduled';
  if (o.valid_until && o.valid_until < today) return 'Expired';
  return 'Active';
}

const STATUS_STYLES: Record<OfferStatus, string> = {
  Active: 'text-green-600 border-green-200 bg-green-50',
  Scheduled: 'text-blue-600 border-blue-200 bg-blue-50',
  Expired: 'text-red-600 border-red-200 bg-red-50',
  None: 'text-muted-foreground border-border',
};

export function CurrentOfferCard({ workspaceId, initialOffer }: { workspaceId: string; initialOffer?: OfferShape | null }) {
  const [name, setName] = useState(initialOffer?.name ?? '');
  const [details, setDetails] = useState(initialOffer?.details ?? '');
  const [validFrom, setValidFrom] = useState(initialOffer?.valid_from ?? '');
  const [validUntil, setValidUntil] = useState(initialOffer?.valid_until ?? '');
  const [saved, setSaved] = useState<OfferShape | null>(initialOffer ?? null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const status = statusOf(saved);

  async function save() {
    if (!workspaceId) return;
    setBusy(true); setError(''); setWarnings([]);
    try {
      const res = await fetch('/api/offer', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name, details, valid_from: validFrom || undefined, valid_until: validUntil || undefined }),
      });
      const j = await res.json() as { ok?: boolean; warnings?: string[]; error?: string };
      if (!res.ok) { setError(j.error ?? 'Failed to save'); toast.error(j.error ?? 'Failed to save offer'); return; }
      setWarnings(j.warnings ?? []);
      setSaved({ name, details, valid_from: validFrom || undefined, valid_until: validUntil || undefined });
      toast.success('Current offer saved');
    } catch {
      setError('Failed to save offer');
      toast.error('Failed to save offer');
    } finally { setBusy(false); }
  }

  async function clear() {
    if (!workspaceId) return;
    setBusy(true); setError(''); setWarnings([]);
    try {
      const res = await fetch(`/api/offer?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        setError(j.error ?? 'Failed to clear');
        toast.error(j.error ?? 'Failed to clear offer');
        return;
      }
      setName(''); setDetails(''); setValidFrom(''); setValidUntil(''); setSaved(null);
      toast.success('Offer cleared');
    } catch {
      setError('Failed to clear offer');
      toast.error('Failed to clear offer');
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-brand-500" />
          <p className="text-sm font-semibold text-foreground">Current Offer</p>
        </div>
        <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', STATUS_STYLES[status])}>
          {status}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        This is the only pricing the bot will quote to customers.
      </p>
      <Input
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        placeholder="Offer name (e.g. Monsoon Offer)"
      />
      <Textarea
        rows={4}
        maxLength={1500}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Offer details — price + terms the bot should quote"
        className="text-sm resize-y"
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1 space-y-1 text-xs">
          <span className="text-muted-foreground">Valid from</span>
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="h-8 text-sm" />
        </label>
        <label className="flex-1 space-y-1 text-xs">
          <span className="text-muted-foreground">Valid until</span>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-8 text-sm" />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Your knowledge base / persona still mentions {warnings.join(', ')} — these may confuse the bot. Consider updating them.
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => void clear()} disabled={busy || !saved} className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}

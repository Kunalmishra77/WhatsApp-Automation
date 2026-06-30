'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2, AlertCircle, ExternalLink, Megaphone, Plus, Trash2,
  RefreshCw, Loader2, Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface InstagramAccount { id: string; ig_username?: string; page_name?: string }
interface Prefill { id: string; text: string; template_name: string | null; created_at: string }

export function MetaAdsSettings() {
  const [igAccounts,    setIgAccounts]    = useState<InstagramAccount[]>([]);
  const [prefills,      setPrefills]      = useState<Prefill[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [newText,       setNewText]       = useState('');
  const [newName,       setNewName]       = useState('');
  const [adding,        setAdding]        = useState(false);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [backfilling,   setBackfilling]   = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ tagged: number; total: number } | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/settings/instagram').then((r) => r.json()).catch(() => ({ accounts: [] })),
      fetch('/api/meta-prefill').then((r) => r.json()).catch(() => ({ prefills: [] })),
    ]).then(([igData, pfData]) => {
      setIgAccounts(igData.accounts ?? []);
      setPrefills(pfData.prefills ?? []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const connected = igAccounts.length > 0;

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/meta-prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText.trim(), template_name: newName.trim() || null }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) { toast.error(d.error ?? 'Failed to add'); return; }
      toast.success('Pre-fill text registered');
      setNewText(''); setNewName('');
      loadData();
    } finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/meta-prefill/${id}`, { method: 'DELETE' });
      setPrefills((prev) => prev.filter((p) => p.id !== id));
      toast.success('Removed');
    } finally { setDeletingId(null); }
  };

  const handleBackfill = async () => {
    if (prefills.length === 0) {
      toast.error('Add at least one pre-fill text first');
      return;
    }
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch('/api/meta-prefill/backfill', { method: 'POST' });
      const d = await res.json() as { tagged?: number; total?: number; message?: string };
      if (!res.ok) { toast.error('Backfill failed'); return; }
      setBackfillResult({ tagged: d.tagged ?? 0, total: d.total ?? 0 });
      toast.success(`Backfill complete — ${d.tagged} conversations tagged`);
    } finally { setBackfilling(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-orange-500" />
          Meta Ads Integration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically detect conversations from Click-to-WhatsApp ads and track leads.
        </p>
      </div>

      {/* Connection status */}
      <div className="rounded-xl border border-border p-4 space-y-2">
        <p className="text-sm font-medium">WhatsApp × Meta Connection</p>
        <div className="flex items-start gap-3">
          {connected
            ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            : <AlertCircle  className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
          <div>
            <p className="text-sm font-medium">
              {connected ? 'Connected via Meta Business' : 'Not connected'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connected
                ? 'Ad referral data will be captured automatically when users click CTWA ads.'
                : 'Connect via Settings → Instagram DM to enable automatic referral capture.'}
            </p>
            {!connected && (
              <a href="/settings?tab=instagram" className="inline-flex items-center gap-1 text-xs text-orange-600 underline mt-1">
                Go to Instagram Settings <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        {connected && igAccounts.map((acc) => (
          <div key={acc.id} className="ml-8">
            <Badge variant="outline" className="text-xs">
              {acc.ig_username ? `@${acc.ig_username}` : acc.page_name ?? 'Facebook Page'}
            </Badge>
          </div>
        ))}
      </div>

      {/* Pre-fill message registry */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div>
          <p className="text-sm font-medium">Ad Pre-fill Message Registry</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Register the exact pre-filled message texts from your Meta ad templates. When a user
            sends one of these as their first message, the conversation is automatically tagged as
            a Meta Ad Lead — even without the <code className="text-[11px] bg-muted px-1 rounded">referral</code> webhook field.
          </p>
        </div>

        {/* Add new */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder='Pre-filled message text (e.g. "Hi, I need cashless treatment details…")'
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              className="text-sm flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void handleAdd(); }}
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Template name (optional, e.g. ECHS Campaign)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-sm flex-1"
            />
            <Button size="sm" onClick={() => void handleAdd()} disabled={!newText.trim() || adding}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : prefills.length === 0 ? (
          <div className="rounded-lg bg-muted/50 px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            No pre-fill texts registered yet. Add the exact text your Meta ad templates use.
          </div>
        ) : (
          <div className="space-y-2">
            {prefills.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{p.text}</p>
                  {p.template_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{p.template_name}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === p.id}
                  onClick={() => void handleDelete(p.id)}
                >
                  {deletingId === p.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backfill section */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-orange-500" />
            Backfill Existing Conversations
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scan all past conversations and tag any whose first message matches a registered pre-fill
            text. This is safe to run multiple times — already-tagged conversations are skipped.
          </p>
        </div>

        {backfillResult && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            ✅ Backfill complete — <strong>{backfillResult.tagged}</strong> conversations tagged out of {backfillResult.total} scanned.
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleBackfill()}
          disabled={backfilling || prefills.length === 0}
        >
          {backfilling
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Running Backfill…</>
            : <><RefreshCw className="h-3.5 w-3.5 mr-2" />Run Backfill Now</>}
        </Button>
        {prefills.length === 0 && (
          <p className="text-xs text-muted-foreground">Add pre-fill texts above before running backfill.</p>
        )}
      </div>

      {/* How detection works */}
      <div className="rounded-xl border border-border p-4 space-y-2">
        <p className="text-sm font-medium">How Detection Works (2 Paths)</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <span className="shrink-0 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">Path 1</span>
            <span><strong className="text-foreground">Meta Referral Object</strong> — when a user clicks a CTWA ad, Meta automatically includes campaign metadata in the webhook. Zero configuration needed.</span>
          </div>
          <div className="flex gap-2">
            <span className="shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">Path 2</span>
            <span><strong className="text-foreground">Pre-fill Text Matching</strong> — the first inbound message is compared against your registered texts. Useful for existing conversations and cases where Meta doesn't send the referral field.</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
        <p className="text-xs text-blue-700">
          <strong>No Meta App Review required.</strong> Both detection paths work with your existing WhatsApp Business API setup — no additional permissions or OAuth flow needed.
        </p>
      </div>
    </div>
  );
}

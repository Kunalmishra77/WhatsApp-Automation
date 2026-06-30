'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2, Plus, Trash2, RefreshCw, Loader2, Info, Megaphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';

interface Prefill { id: string; text: string; template_name: string | null; created_at: string }

export function MetaAdsSettings() {
  const [prefills,       setPrefills]       = useState<Prefill[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [newText,        setNewText]        = useState('');
  const [newName,        setNewName]        = useState('');
  const [adding,         setAdding]         = useState(false);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [backfilling,    setBackfilling]    = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ tagged: number; total: number } | null>(null);

  const workspace = useWorkspaceStore((s) => s.activeWorkspace);
  const waConnected = !!(workspace?.phone_number_id || workspace?.waba_id);

  const loadPrefills = () => {
    setLoading(true);
    fetch('/api/meta-prefill')
      .then((r) => r.json())
      .then((d) => setPrefills(d.prefills ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPrefills(); }, []);

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
      loadPrefills();
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
    if (prefills.length === 0) { toast.error('Add at least one pre-fill text first'); return; }
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch('/api/meta-prefill/backfill', { method: 'POST' });
      const d = await res.json() as { tagged?: number; total?: number };
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
          Automatically detect and track conversations coming from your Facebook &amp; Instagram advertisements.
        </p>
      </div>

      {/* WhatsApp connection status — checks the actual WA Business API config */}
      <div className="rounded-xl border border-border p-4 space-y-2">
        <p className="text-sm font-medium">WhatsApp Business API Status</p>
        <div className="flex items-start gap-3">
          <CheckCircle2 className={`h-5 w-5 shrink-0 mt-0.5 ${waConnected ? 'text-green-500' : 'text-amber-400'}`} />
          <div>
            <p className={`text-sm font-medium ${waConnected ? 'text-green-700' : 'text-amber-700'}`}>
              {waConnected ? 'Connected & Active' : 'WhatsApp not yet configured'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {waConnected
                ? 'Your WhatsApp Business number is live on the Meta platform. Click-to-WhatsApp ad conversations are automatically captured — no extra setup needed.'
                : 'Configure your WhatsApp Business API in Settings → Configuration to enable ad lead detection.'}
            </p>
          </div>
        </div>
        <div className="ml-8 text-xs text-muted-foreground space-y-0.5">
          <p>Phone Number ID: <span className="font-mono text-foreground">{workspace?.phone_number_id ?? '—'}</span></p>
          <p>WABA ID: <span className="font-mono text-foreground">{workspace?.waba_id ?? '—'}</span></p>
        </div>
      </div>

      {/* How it works — simple, clear */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium">How Ad Lead Detection Works</p>
        <div className="space-y-2.5 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <span className="shrink-0 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">Path 1</span>
            <span><strong className="text-foreground">Meta Referral Object</strong> — when a user clicks a Click-to-WhatsApp ad, Meta automatically includes campaign metadata in the webhook. Zero configuration.</span>
          </div>
          <div className="flex gap-2">
            <span className="shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">Path 2</span>
            <span><strong className="text-foreground">Pre-fill Text Matching</strong> — register the exact pre-filled messages from your ad templates below. Any conversation starting with that text is auto-tagged as a Meta Ad Lead.</span>
          </div>
        </div>
      </div>

      {/* Pre-fill registry */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div>
          <p className="text-sm font-medium">Ad Pre-fill Message Registry</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Copy the exact pre-filled message text from your Meta ad template and paste it here.
            Must match character-for-character (case-insensitive).
          </p>
        </div>

        <div className="space-y-2">
          <Input
            placeholder='Pre-filled message text (e.g. "Hello! Can I get more info on this?")'
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Template name — optional label (e.g. ECHS Campaign)"
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

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
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
                  variant="ghost" size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === p.id}
                  onClick={() => void handleDelete(p.id)}
                >
                  {deletingId === p.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2  className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backfill */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-orange-500" />
            Backfill Existing Conversations
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scans all past conversations and tags those whose first message matches a registered
            pre-fill text. Safe to run multiple times — already-tagged conversations are skipped.
          </p>
        </div>

        {backfillResult && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            ✅ Done — <strong>{backfillResult.tagged}</strong> conversations tagged out of {backfillResult.total} scanned.
          </div>
        )}

        <Button
          variant="outline" size="sm"
          onClick={() => void handleBackfill()}
          disabled={backfilling || prefills.length === 0}
        >
          {backfilling
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Running…</>
            : <><RefreshCw className="h-3.5 w-3.5 mr-2" />Run Backfill Now</>}
        </Button>
        {prefills.length === 0 && (
          <p className="text-xs text-muted-foreground">Add pre-fill texts above before running backfill.</p>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
        <p className="text-xs text-blue-700">
          <strong>No Meta App Review required.</strong> Ad referral detection works with your existing WhatsApp Business API webhook — no additional permissions or OAuth needed.
        </p>
      </div>
    </div>
  );
}

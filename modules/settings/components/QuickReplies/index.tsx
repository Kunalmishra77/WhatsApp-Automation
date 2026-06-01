'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Zap, Loader2, Search } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';

interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category: string;
}

const SAMPLE_REPLIES: Array<Omit<QuickReply, 'id'>> = [
  { shortcut: '/hi',      title: 'Greeting',        category: 'general',  content: 'Hello! Welcome to V4TOU Tech. How can I help you today? 😊' },
  { shortcut: '/thanks',  title: 'Thank You',        category: 'general',  content: 'Thank you for contacting us! Is there anything else I can help you with?' },
  { shortcut: '/price',   title: 'Pricing Info',     category: 'sales',    content: 'Our plans start at ₹999/month. We also offer a free 14-day trial — no credit card needed. Would you like more details?' },
  { shortcut: '/wait',    title: 'Please Hold',      category: 'support',  content: 'Please give me a moment to check that for you. I\'ll be right back! 🙏' },
  { shortcut: '/closed',  title: 'Business Closed',  category: 'general',  content: 'We are currently closed. Our support hours are Mon-Sat, 10AM-6PM IST. We\'ll respond first thing tomorrow morning!' },
  { shortcut: '/trial',   title: 'Free Trial',       category: 'sales',    content: 'Great news! You can try Agentix free for 14 days — no credit card required. Sign up at https://agentix.in to get started! 🚀' },
  { shortcut: '/refund',  title: 'Refund Policy',    category: 'support',  content: 'We offer a 30-day money-back guarantee on all paid plans. If you\'re not satisfied, contact us within 30 days of payment for a full refund.' },
  { shortcut: '/sorry',   title: 'Apology',          category: 'support',  content: 'I sincerely apologize for the inconvenience. We take this seriously and will do our best to resolve it immediately.' },
];

export function QuickReplies() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editReply, setEditReply] = useState<QuickReply | null>(null);
  const [formShortcut, setFormShortcut] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/quick-replies?workspaceId=${workspaceId}`);
      const data = await res.json() as { replies?: QuickReply[] };
      setReplies(data.replies ?? []);
    } catch { toast.error('Failed to load quick replies'); }
    finally { setIsLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  const openAdd = () => {
    setEditReply(null); setFormShortcut(''); setFormTitle(''); setFormContent(''); setDialogOpen(true);
  };
  const openEdit = (r: QuickReply) => {
    setEditReply(r); setFormShortcut(r.shortcut); setFormTitle(r.title); setFormContent(r.content); setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!workspaceId || !formShortcut.trim() || !formTitle.trim() || !formContent.trim()) {
      toast.error('All fields required'); return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/quick-replies', {
        method: editReply ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editReply?.id, workspaceId, shortcut: formShortcut, title: formTitle, content: formContent }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      toast.success(editReply ? 'Updated' : 'Quick reply added');
      setDialogOpen(false);
      void fetch_();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId || !confirm('Delete this quick reply?')) return;
    await fetch(`/api/quick-replies?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' });
    setReplies((p) => p.filter((r) => r.id !== id));
    toast.success('Deleted');
  };

  const handleLoadSamples = async () => {
    if (!workspaceId) return;
    setIsLoadingSamples(true);
    let added = 0;
    for (const sample of SAMPLE_REPLIES) {
      try {
        const res = await fetch('/api/quick-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, ...sample }),
        });
        if (res.ok) added++;
      } catch { /* skip duplicates */ }
    }
    toast.success(`${added} sample quick replies added`);
    setIsLoadingSamples(false);
    void fetch_();
  };

  const filtered = replies.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.shortcut.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-500" />
            Quick Replies
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pre-saved responses agents can insert instantly. Type <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">/</kbd> in any conversation to search and insert.
          </p>
        </div>
        <div className="flex gap-2">
          {replies.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => void handleLoadSamples()} disabled={isLoadingSamples}>
              {isLoadingSamples ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '📋 Load Samples'}
            </Button>
          )}
          <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Add</Button>
        </div>
      </div>

      {replies.length > 0 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search quick replies…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : filtered.length === 0 && replies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Zap className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No quick replies yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Load sample replies or create your own.</p>
          <div className="flex justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => void handleLoadSamples()} disabled={isLoadingSamples}>
              {isLoadingSamples ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : '📋 '} Load Samples
            </Button>
            <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Create</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <div className="shrink-0 mt-0.5 rounded-md bg-brand-100 px-2 py-0.5 text-xs font-mono font-medium text-brand-700">
                {r.shortcut}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.content}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => void handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editReply ? 'Edit Quick Reply' : 'Add Quick Reply'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Shortcut</Label>
                <Input placeholder="/thanks" value={formShortcut} onChange={(e) => setFormShortcut(e.target.value)} className="font-mono" />
                <p className="text-[11px] text-muted-foreground">Start with / — e.g. /price</p>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="Pricing Info" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Message Content</Label>
              <Textarea rows={5} placeholder="Type the full message here…" value={formContent} onChange={(e) => setFormContent(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">{formContent.length} characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !formShortcut.trim() || !formTitle.trim() || !formContent.trim()}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : editReply ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

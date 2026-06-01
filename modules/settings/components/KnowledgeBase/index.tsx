'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Sparkles, Loader2, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';

interface KBEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = ['general', 'pricing', 'shipping', 'returns', 'support', 'faq', 'hours', 'contact'];

const CATEGORY_COLOR: Record<string, string> = {
  general:  'bg-gray-100 text-gray-700',
  pricing:  'bg-green-100 text-green-700',
  shipping: 'bg-blue-100 text-blue-700',
  returns:  'bg-orange-100 text-orange-700',
  support:  'bg-purple-100 text-purple-700',
  faq:      'bg-yellow-100 text-yellow-700',
  hours:    'bg-teal-100 text-teal-700',
  contact:  'bg-pink-100 text-pink-700',
};

export function KnowledgeBase() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<KBEntry | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [isSaving, setIsSaving] = useState(false);

  // AI Generate dialog
  const [generateOpen, setGenerateOpen] = useState(false);
  const [companyDesc, setCompanyDesc] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEntries, setGeneratedEntries] = useState<Array<{ title: string; content: string; category: string }>>([]);
  const [selectedGenerated, setSelectedGenerated] = useState<Set<number>>(new Set());

  const fetchEntries = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/knowledge-base?workspaceId=${workspaceId}`);
      const data = await res.json() as { entries?: KBEntry[] };
      setEntries(data.entries ?? []);
    } catch {
      toast.error('Failed to load knowledge base');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  const openAdd = () => {
    setEditEntry(null);
    setFormTitle('');
    setFormContent('');
    setFormCategory('general');
    setDialogOpen(true);
  };

  const openEdit = (entry: KBEntry) => {
    setEditEntry(entry);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormCategory(entry.category);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!workspaceId || !formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/knowledge-base', {
        method: editEntry ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEntry?.id,
          workspaceId,
          title: formTitle,
          content: formContent,
          category: formCategory,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      toast.success(editEntry ? 'Entry updated' : 'Entry added');
      setDialogOpen(false);
      void fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (entry: KBEntry) => {
    if (!workspaceId) return;
    try {
      await fetch('/api/knowledge-base', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, workspaceId, isActive: !entry.is_active }),
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, is_active: !e.is_active } : e)),
      );
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId || !confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`/api/knowledge-base?id=${id}&workspaceId=${workspaceId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Entry deleted');
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleGenerate = async () => {
    if (!workspaceId || !companyDesc.trim()) {
      toast.error('Please describe your company');
      return;
    }
    setIsGenerating(true);
    setGeneratedEntries([]);
    try {
      const res = await fetch('/api/knowledge-base/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, companyDescription: companyDesc }),
      });
      const data = await res.json() as {
        entries?: Array<{ title: string; content: string; category: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setGeneratedEntries(data.entries ?? []);
      setSelectedGenerated(new Set(data.entries?.map((_, i) => i) ?? []));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportGenerated = async () => {
    if (!workspaceId || generatedEntries.length === 0) return;
    const toImport = generatedEntries.filter((_, i) => selectedGenerated.has(i));
    if (toImport.length === 0) { toast.error('Select at least one entry'); return; }

    setIsSaving(true);
    let saved = 0;
    for (const entry of toImport) {
      try {
        const res = await fetch('/api/knowledge-base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, ...entry }),
        });
        if (res.ok) saved++;
      } catch { /* continue */ }
    }
    setIsSaving(false);
    toast.success(`${saved} entries added to knowledge base`);
    setGenerateOpen(false);
    setGeneratedEntries([]);
    setCompanyDesc('');
    void fetchEntries();
  };

  const activeCount = entries.filter((e) => e.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-500" />
            Knowledge Base
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add company info, FAQs, policies — the AI bot uses these to answer customer questions accurately.
            {activeCount > 0 && (
              <span className="ml-1 font-medium text-foreground">{activeCount} active {activeCount === 1 ? 'entry' : 'entries'}.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1.5 text-brand-500" />
            Generate with AI
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Entries list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No knowledge base entries yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Click <strong>Generate with AI</strong> to auto-create entries from your company description, or add manually.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate with AI
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add manually
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'rounded-lg border border-border bg-card transition-all',
                !entry.is_active && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <Switch
                  checked={entry.is_active}
                  onCheckedChange={() => void handleToggle(entry)}
                  className="shrink-0"
                />
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">{entry.title}</span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', CATEGORY_COLOR[entry.category] ?? CATEGORY_COLOR.general)}>
                      {entry.category}
                    </span>
                  </div>
                  {expandedId !== entry.id && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{entry.content}</p>
                  )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => void handleDelete(entry.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <button onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} className="text-muted-foreground p-1">
                    {expandedId === entry.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              {expandedId === entry.id && (
                <div className="border-t border-border px-4 py-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.content}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Entry' : 'Add Knowledge Base Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="e.g. Return Policy" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea
                placeholder="e.g. We offer 30-day returns. The item must be unused and in original packaging. Contact support@company.com to initiate a return."
                rows={5}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">The AI bot will use this exact text to answer customer questions.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !formTitle.trim() || !formContent.trim()}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : editEntry ? 'Update' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generate Dialog */}
      <Dialog open={generateOpen} onOpenChange={(v) => { setGenerateOpen(v); if (!v) setGeneratedEntries([]); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-500" />
              Generate Knowledge Base with AI
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Describe your company</Label>
              <Textarea
                placeholder={`Example:\nWe are V4TOU Tech, a software company in India that sells WhatsApp automation tools for businesses. Our pricing starts at ₹999/month. We offer free 14-day trial. Support is available Mon-Sat 10am-6pm IST. We have a 30-day refund policy. Our main product is Agentix — a WhatsApp CRM dashboard.`}
                rows={5}
                value={companyDesc}
                onChange={(e) => setCompanyDesc(e.target.value)}
              />
            </div>

            {generatedEntries.length === 0 ? (
              <Button
                onClick={() => void handleGenerate()}
                disabled={isGenerating || !companyDesc.trim()}
                className="w-full"
              >
                {isGenerating
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating…</>
                  : <><Sparkles className="h-4 w-4 mr-2" />Generate Knowledge Base</>}
              </Button>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{generatedEntries.length} entries generated — select which to import:</p>
                  <button
                    className="text-xs text-brand-500 hover:underline"
                    onClick={() =>
                      setSelectedGenerated(
                        selectedGenerated.size === generatedEntries.length
                          ? new Set()
                          : new Set(generatedEntries.map((_, i) => i)),
                      )
                    }
                  >
                    {selectedGenerated.size === generatedEntries.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                <div className="space-y-2">
                  {generatedEntries.map((entry, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        const next = new Set(selectedGenerated);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        setSelectedGenerated(next);
                      }}
                      className={cn(
                        'cursor-pointer rounded-lg border p-3 transition-all select-none',
                        selectedGenerated.has(i)
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-border bg-card opacity-60',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{entry.title}</span>
                        <Badge variant="secondary" className="text-[10px]">{entry.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{entry.content}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => void handleGenerate()} disabled={isGenerating} className="flex-1">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Regenerate'}
                  </Button>
                  <Button
                    onClick={() => void handleImportGenerated()}
                    disabled={isSaving || selectedGenerated.size === 0}
                    className="flex-1"
                  >
                    {isSaving
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>
                      : `Import ${selectedGenerated.size} entries`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

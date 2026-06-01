'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Loader2, BookOpen, Database } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { EntryList } from './EntryList';
import { UploadTab } from './UploadTab';
import { GenerateTab } from './GenerateTab';
import { TemplatesTab } from './TemplatesTab';
import { CATEGORIES, CATEGORY_META } from './types';
import type { KBEntry, KBEntryDraft } from './types';

export function KnowledgeBase() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<KBEntry | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formTags, setFormTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    setFormTags('');
    setDialogOpen(true);
  };

  const openEdit = (entry: KBEntry) => {
    setEditEntry(entry);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormCategory(entry.category);
    setFormTags((entry.tags ?? []).join(', '));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!workspaceId || !formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setIsSaving(true);
    const tags = formTags.split(',').map((t) => t.trim()).filter(Boolean);
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
          tags,
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
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, is_active: !e.is_active } : e));
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id: string) => {
    if (!workspaceId || !confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`/api/knowledge-base?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Entry deleted');
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { toast.error('Failed to delete'); }
  };

  const handleBulkImport = async (drafts: KBEntryDraft[], source: string, filename?: string) => {
    if (!workspaceId) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/knowledge-base/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, entries: drafts, source, sourceFilename: filename }),
      });
      const data = await res.json() as { inserted?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      toast.success(`${data.inserted ?? drafts.length} entries added to knowledge base`);
      void fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const activeCount = entries.filter((e) => e.is_active).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-500" />
            Knowledge Base
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your AI bot uses this to answer customer questions accurately.
            {entries.length > 0 && (
              <span className="ml-1">
                <span className="font-medium text-foreground">{activeCount} active</span>
                {' '}/ {entries.length} total entries.
              </span>
            )}
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" />Add Entry
        </Button>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Entries
            {entries.length > 0 && (
              <span className="ml-1 rounded-full bg-brand-100 text-brand-700 px-1.5 py-0.5 text-[10px] font-medium">
                {entries.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upload">📄 Upload File</TabsTrigger>
          <TabsTrigger value="generate">✨ AI Generate</TabsTrigger>
          <TabsTrigger value="templates">📋 Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <EntryList
              entries={entries}
              onEdit={openEdit}
              onDelete={(id) => void handleDelete(id)}
              onToggle={(e) => void handleToggle(e)}
            />
          )}
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          {workspaceId && (
            <UploadTab
              workspaceId={workspaceId}
              onImport={handleBulkImport}
              isImporting={isImporting}
            />
          )}
        </TabsContent>

        <TabsContent value="generate" className="mt-4">
          {workspaceId && (
            <GenerateTab
              workspaceId={workspaceId}
              onImport={handleBulkImport}
              isImporting={isImporting}
            />
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab
            onImport={handleBulkImport}
            isImporting={isImporting}
          />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Knowledge Base Entry' : 'Add Knowledge Base Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="e.g. Return Policy, Pricing Plans, Support Hours" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_META[c]?.label ?? c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tags <span className="text-muted-foreground text-xs">(comma separated)</span></Label>
              <Input placeholder="e.g. refund, cancel, policy" value={formTags} onChange={(e) => setFormTags(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea
                placeholder="Write the full answer the bot should give to customers about this topic. Be specific and complete."
                rows={6}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Characters: {formContent.length} — The AI bot will use this text to answer customer questions.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !formTitle.trim() || !formContent.trim()}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : editEntry ? 'Update Entry' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

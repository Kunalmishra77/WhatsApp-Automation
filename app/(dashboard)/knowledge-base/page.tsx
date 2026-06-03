'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  FileText, Trash2, Upload, Search, Database,
  Loader2, CheckCircle2, AlertCircle, Wand2,
  Sparkles, RefreshCw, Check, ChevronRight,
  FileCheck, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'documents' | 'sandbox' | 'ai-generate';

interface VectorDoc {
  filename: string;
  file_type: string;
  chunks: number;
  created_at: string;
}

interface SearchResult {
  id: string;
  filename: string;
  chunk_index: number;
  content: string;
  similarity: number;
  similarity_pct: string;
}

interface UploadQueueItem {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  chunks?: number;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SimilarityBar({ pct }: { pct: number }) {
  const color = pct >= 0.7 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
    </div>
  );
}

function fileIcon(type: string) {
  if (type === 'pdf')  return '📕';
  if (type === 'csv')  return '📊';
  if (type === 'json') return '📋';
  if (type === 'md')   return '📝';
  if (type === 'docx') return '📘';
  if (type === 'xlsx' || type === 'xls') return '📗';
  return '📄';
}

const DOC_TYPES = [
  { value: 'faq',          label: '❓ FAQ — Frequently Asked Questions' },
  { value: 'product_info', label: '📦 Product / Service Information' },
  { value: 'pricing',      label: '💰 Pricing & Plans' },
  { value: 'policies',     label: '📋 Policies (Return, Refund, Shipping)' },
  { value: 'onboarding',   label: '🚀 Customer Onboarding Guide' },
  { value: 'support',      label: '🛠️ Support Troubleshooting Guide' },
  { value: 'company_info', label: '🏢 Company / About Us' },
  { value: 'custom',       label: '✏️ Custom Document' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [tab, setTab]           = useState<Tab>('documents');
  const workspaceId             = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient             = useQueryClient();
  const fileInputRef            = useRef<HTMLInputElement>(null);

  // Upload queue
  const [queue, setQueue]       = useState<UploadQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Search
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching]       = useState(false);

  // Delete
  const [deleting, setDeleting]         = useState<string | null>(null);

  // AI Generator state
  const [aiStep, setAiStep]             = useState<'form' | 'preview'>('form');
  const [aiDocType, setAiDocType]       = useState('faq');
  const [aiBusinessName, setAiBusinessName] = useState('');
  const [aiPrompt, setAiPrompt]         = useState('');
  const [aiLanguage, setAiLanguage]     = useState('English');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiContent, setAiContent]       = useState('');
  const [aiFilename, setAiFilename]     = useState('');
  const [aiSaving, setAiSaving]         = useState(false);

  // Fetch documents
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['vector-docs', workspaceId],
    queryFn: () =>
      fetch(`/api/vector-kb?workspaceId=${workspaceId}`)
        .then((r) => r.json() as Promise<{ documents: VectorDoc[] }>),
    enabled: !!workspaceId,
  });
  const docs = docsData?.documents ?? [];

  // ── Upload single file ────────────────────────────────────────────────────
  const uploadFile = async (item: UploadQueueItem): Promise<UploadQueueItem> => {
    const form = new FormData();
    form.append('file', item.file);
    form.append('workspaceId', workspaceId);
    try {
      const res = await fetch('/api/vector-kb/upload', { method: 'POST', body: form });

      // Handle non-JSON responses (e.g., 413 Request Entity Too Large)
      let data: { chunks_created?: number; error?: string } = {};
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try { data = await res.json() as typeof data; } catch { /* */ }
      } else {
        const text = await res.text();
        if (res.status === 413) data.error = `File too large (max 10MB). Current: ${(item.file.size / 1024 / 1024).toFixed(1)}MB`;
        else if (!res.ok) data.error = text.slice(0, 100) || `Server error ${res.status}`;
      }

      if (!res.ok) return { ...item, status: 'error', error: data.error ?? `Upload failed (${res.status})` };
      return { ...item, status: 'done', chunks: data.chunks_created ?? 0 };
    } catch (e) {
      return { ...item, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' };
    }
  };

  // ── Process queue sequentially ────────────────────────────────────────────
  const processQueue = async (files: File[]) => {
    const items: UploadQueueItem[] = files.map((f) => ({ file: f, status: 'pending' }));
    setQueue(items);
    setIsProcessing(true);

    const results: UploadQueueItem[] = [...items];

    for (let i = 0; i < items.length; i++) {
      // Mark as uploading
      results[i] = { ...results[i]!, status: 'uploading' };
      setQueue([...results]);

      // Upload
      const result = await uploadFile(results[i]!);
      results[i] = result;
      setQueue([...results]);

      if (result.status === 'done') {
        toast.success(`✅ ${result.file.name}: ${result.chunks} chunks indexed`);
      } else {
        toast.error(`❌ ${result.file.name}: ${result.error}`);
      }
    }

    setIsProcessing(false);
    void queryClient.invalidateQueries({ queryKey: ['vector-docs', workspaceId] });

    // Clear queue after 5 seconds
    setTimeout(() => setQueue([]), 5000);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void processQueue(Array.from(files));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ── Delete document ───────────────────────────────────────────────────────
  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete all chunks for "${filename}"?`)) return;
    setDeleting(filename);
    try {
      await fetch(`/api/vector-kb?workspaceId=${workspaceId}&filename=${encodeURIComponent(filename)}`, { method: 'DELETE' });
      toast.success('Document deleted');
      void queryClient.invalidateQueries({ queryKey: ['vector-docs', workspaceId] });
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  // ── Vector search ─────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const res  = await fetch('/api/vector-kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, query: searchQuery, limit: 5 }),
      });
      const data = await res.json() as { results: SearchResult[] };
      setSearchResults(data.results ?? []);
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  // ── AI Generate ───────────────────────────────────────────────────────────
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const res  = await fetch('/api/vector-kb/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          docType:      aiDocType,
          prompt:       aiPrompt,
          businessName: aiBusinessName,
          language:     aiLanguage,
        }),
      });
      const data = await res.json() as { content?: string; filename?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setAiContent(data.content ?? '');
      setAiFilename(data.filename ?? 'ai_generated.txt');
      setAiStep('preview');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAISave = async () => {
    if (!aiContent.trim()) return;
    setAiSaving(true);
    try {
      const res  = await fetch('/api/vector-kb/generate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, content: aiContent, filename: aiFilename }),
      });
      const data = await res.json() as { chunks_created?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      toast.success(`✅ "${aiFilename}" saved — ${data.chunks_created} chunks vectorized`);
      void queryClient.invalidateQueries({ queryKey: ['vector-docs', workspaceId] });
      // Reset
      setAiStep('form');
      setAiContent('');
      setAiFilename('');
      setAiPrompt('');
      setTab('documents');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setAiSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-500" />
            Knowledge Base
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Vector-indexed documents for AI replies</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {([
              { id: 'documents',   label: 'Documents' },
              { id: 'ai-generate', label: '✨ AI Generate' },
              { id: 'sandbox',     label: 'Vector Sandbox' },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === t.id ? 'bg-brand-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'documents' && (
            <Button size="sm" className="gap-1.5 h-8" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload Files
            </Button>
          )}
        </div>
      </div>

      {/* Hidden multi-file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx,.xls"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      <div className="flex-1 overflow-y-auto p-6">

        {/* ══ DOCUMENTS TAB ═══════════════════════════════════════════════ */}
        {tab === 'documents' && (
          <div className="space-y-4 max-w-3xl">
            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={cn(
                'rounded-xl border-2 border-dashed transition-colors p-8 text-center cursor-pointer',
                isProcessing ? 'border-brand-300 bg-brand-50/50 cursor-default' : 'border-border hover:border-brand-300',
              )}
            >
              {isProcessing ? (
                <div className="space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500 mx-auto" />
                  <p className="text-sm font-medium">Processing files…</p>
                  <p className="text-xs text-muted-foreground">Generating embeddings — this may take a moment</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">Drop files here or click to upload</p>
                  <p className="text-xs text-muted-foreground">
                    Select <strong>multiple files</strong> at once · TXT, PDF, DOCX, XLSX, CSV, JSON (max 10MB each)
                  </p>
                </div>
              )}
            </div>

            {/* Upload queue */}
            {queue.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Upload Queue ({queue.filter((q) => q.status === 'done').length}/{queue.length} done)
                </p>
                {queue.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div className="shrink-0">
                      {item.status === 'pending'   && <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />}
                      {item.status === 'uploading' && <Loader2 className="h-5 w-5 animate-spin text-brand-500" />}
                      {item.status === 'done'      && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                      {item.status === 'error'     && <AlertCircle className="h-5 w-5 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.file.name}</p>
                      {item.status === 'uploading' && <p className="text-[10px] text-brand-600">Embedding chunks…</p>}
                      {item.status === 'done'      && <p className="text-[10px] text-green-600">{item.chunks} chunks indexed</p>}
                      {item.status === 'error'     && <p className="text-[10px] text-red-500">{item.error}</p>}
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0', {
                      'text-muted-foreground': item.status === 'pending',
                      'text-brand-600 border-brand-200': item.status === 'uploading',
                      'text-green-600 border-green-200': item.status === 'done',
                      'text-red-600 border-red-200': item.status === 'error',
                    })}>
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Document list */}
            {docsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : docs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No documents yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Upload files above or use <strong>✨ AI Generate</strong> to create one.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">{docs.length} document{docs.length !== 1 ? 's' : ''} indexed</p>
                {docs.map((doc) => (
                  <div key={doc.filename} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand-200 transition-colors">
                    <span className="text-2xl shrink-0">{fileIcon(doc.file_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{doc.chunks} chunks</Badge>
                        <span className="text-[11px] text-muted-foreground">{new Date(doc.created_at).toLocaleDateString('en-IN')}</span>
                        {doc.filename.includes('ai_generated') && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700 border-none">✨ AI</Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => void handleDelete(doc.filename)} disabled={deleting === doc.filename}>
                      {deleting === doc.filename ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ AI GENERATE TAB ══════════════════════════════════════════════ */}
        {tab === 'ai-generate' && (
          <div className="max-w-2xl space-y-5">
            {aiStep === 'form' && (
              <>
                <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 flex items-start gap-3">
                  <Wand2 className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-purple-900">AI Document Generator</p>
                    <p className="text-xs text-purple-700 mt-0.5">
                      Describe your business and what content you need — AI will write a complete document, which you can review and edit before saving to your vector knowledge base.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Business name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="biz-name">Business / Brand Name</Label>
                    <Input
                      id="biz-name"
                      value={aiBusinessName}
                      onChange={(e) => setAiBusinessName(e.target.value)}
                      placeholder="e.g. Agentix, MyShop India, TechCare Solutions"
                    />
                  </div>

                  {/* Document type */}
                  <div className="space-y-1.5">
                    <Label>Document Type</Label>
                    <Select value={aiDocType} onValueChange={setAiDocType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Language */}
                  <div className="space-y-1.5">
                    <Label>Language</Label>
                    <Select value={aiLanguage} onValueChange={setAiLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Hindi">Hindi (हिंदी)</SelectItem>
                        <SelectItem value="Hinglish">Hinglish (Hindi + English)</SelectItem>
                        <SelectItem value="Marathi">Marathi</SelectItem>
                        <SelectItem value="Tamil">Tamil</SelectItem>
                        <SelectItem value="Telugu">Telugu</SelectItem>
                        <SelectItem value="Gujarati">Gujarati</SelectItem>
                        <SelectItem value="Bengali">Bengali</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-desc">
                      Describe what to include <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="ai-desc"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder={
                        aiDocType === 'faq' ? 'e.g. We sell handmade jewelry online. Common questions: delivery time (5-7 days), payment methods (UPI, card, COD), return policy (7 days), custom orders, materials used...' :
                        aiDocType === 'pricing' ? 'e.g. We offer 3 plans: Basic (₹999/mo - 5 users), Pro (₹2499/mo - unlimited users, analytics), Enterprise (custom pricing). Annual discount 20%...' :
                        aiDocType === 'policies' ? 'e.g. Returns within 30 days with receipt, free shipping above ₹500, express delivery in 2 days for ₹99, no cash refunds only store credit...' :
                        'Describe your business and what this document should cover in detail...'
                      }
                      className="min-h-[140px] resize-none"
                    />
                    <p className="text-[11px] text-muted-foreground">Be specific — the more details you give, the better the document.</p>
                  </div>

                  {/* Example hints */}
                  <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-500" /> Tips for better results
                    </p>
                    <ul className="text-[11px] text-muted-foreground space-y-1">
                      <li>• Include your product/service names, prices, features</li>
                      <li>• Mention your policies, timelines, contact details</li>
                      <li>• Add any specific things customers usually ask about</li>
                      <li>• You can edit the generated content before saving</li>
                    </ul>
                  </div>

                  <Button
                    onClick={() => void handleAIGenerate()}
                    disabled={!aiPrompt.trim() || aiGenerating}
                    className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                    size="lg"
                  >
                    {aiGenerating
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating document…</>
                      : <><Wand2 className="h-4 w-4" /> Generate Document</>}
                  </Button>
                </div>
              </>
            )}

            {aiStep === 'preview' && (
              <div className="space-y-4">
                {/* Preview header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">Review Generated Document</p>
                      <p className="text-xs text-muted-foreground">Edit if needed, then save to Knowledge Base</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAiStep('form')}>
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                  </Button>
                </div>

                {/* Filename */}
                <div className="space-y-1.5">
                  <Label>Filename</Label>
                  <Input
                    value={aiFilename}
                    onChange={(e) => setAiFilename(e.target.value)}
                    placeholder="document_name.txt"
                  />
                </div>

                {/* Editable content */}
                <div className="space-y-1.5">
                  <Label>Document Content <span className="text-muted-foreground font-normal text-xs">(editable)</span></Label>
                  <Textarea
                    value={aiContent}
                    onChange={(e) => setAiContent(e.target.value)}
                    className="min-h-[400px] font-mono text-xs resize-y"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {aiContent.length} chars · ~{Math.ceil(aiContent.length / 450)} chunks after vectorization
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setAiStep('form'); setAiContent(''); }} className="gap-1.5">
                    <X className="h-4 w-4" /> Discard
                  </Button>
                  <Button
                    onClick={() => void handleAISave()}
                    disabled={!aiContent.trim() || !aiFilename.trim() || aiSaving}
                    className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {aiSaving
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving to KB…</>
                      : <><Check className="h-4 w-4" /> Save to Knowledge Base</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ VECTOR SANDBOX TAB ══════════════════════════════════════════ */}
        {tab === 'sandbox' && (
          <div className="space-y-5 max-w-3xl">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium text-foreground mb-1">Vector KB Sandbox</p>
              <p className="text-xs text-muted-foreground mb-3">
                Test semantic search — see which chunks your AI will use to answer a customer message.
              </p>
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. what is your return policy?"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                />
                <Button onClick={() => void handleSearch()} disabled={searching || !searchQuery.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {searching ? 'Searching…' : 'Search Vectors'}
                </Button>
              </div>
            </div>

            {searchResults === null && !searching && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Enter a search query to test your vector knowledge base</p>
              </div>
            )}

            {searchResults?.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-medium">No matching chunks found</p>
                <p className="text-xs text-muted-foreground mt-1">Try different keywords or upload more documents</p>
              </div>
            )}

            {searchResults && searchResults.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </p>
                {searchResults.map((result, i) => (
                  <div key={result.id ?? i} className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium">{result.filename}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">chunk {result.chunk_index}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <SimilarityBar pct={result.similarity} />
                        <span className={cn('text-xs font-bold',
                          result.similarity >= 0.7 ? 'text-emerald-600' :
                          result.similarity >= 0.5 ? 'text-amber-600' :
                          result.similarity > 0 ? 'text-red-500' : 'text-muted-foreground',
                        )}>
                          {result.similarity_pct}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-4 border-t border-border/50 pt-2">
                      {result.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

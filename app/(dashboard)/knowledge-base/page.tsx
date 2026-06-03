'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  FileText, Trash2, Upload, Search, Database,
  FileType2, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'documents' | 'sandbox';

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

function SimilarityBar({ pct }: { pct: number }) {
  const color = pct >= 0.7 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
    </div>
  );
}

export default function KnowledgeBasePage() {
  const [tab, setTab] = useState<Tab>('documents');
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch documents list
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['vector-docs', workspaceId],
    queryFn: () =>
      fetch(`/api/vector-kb?workspaceId=${workspaceId}`)
        .then((r) => r.json() as Promise<{ documents: VectorDoc[] }>),
    enabled: !!workspaceId,
  });

  const docs = docsData?.documents ?? [];

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}…`);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);

      setUploadProgress('Processing chunks and generating embeddings…');
      const res = await fetch('/api/vector-kb/upload', { method: 'POST', body: form });
      let data: { success?: boolean; chunks_created?: number; filename?: string; error?: string } = {};
      try { data = await res.json(); } catch { /* non-json */ }

      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setUploadProgress('');
      toast.success(`✅ ${data.filename}: ${data.chunks_created} chunks indexed`);
      void queryClient.invalidateQueries({ queryKey: ['vector-docs', workspaceId] });
    } catch (err) {
      setUploadProgress('');
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete all chunks for "${filename}"?`)) return;
    setDeleting(filename);
    try {
      await fetch(`/api/vector-kb?workspaceId=${workspaceId}&filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      toast.success('Document deleted');
      void queryClient.invalidateQueries({ queryKey: ['vector-docs', workspaceId] });
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const res = await fetch('/api/vector-kb/search', {
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

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFileUpload(file);
  }, [workspaceId]);

  const fileIcon = (type: string) => {
    if (type === 'pdf') return '📕';
    if (type === 'csv') return '📊';
    if (type === 'json') return '📋';
    if (type === 'md') return '📝';
    return '📄';
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-500" />
            Knowledge Base
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Upload documents → auto-chunked → vector indexed for AI replies</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setTab('documents')}
              className={cn('px-4 py-1.5 text-sm font-medium transition-colors', tab === 'documents' ? 'bg-brand-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground')}
            >
              Documents
            </button>
            <button
              onClick={() => setTab('sandbox')}
              className={cn('px-4 py-1.5 text-sm font-medium transition-colors', tab === 'sandbox' ? 'bg-brand-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground')}
            >
              Vector Sandbox
            </button>
          </div>
          {tab === 'documents' && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Document
            </Button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx,.xls"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* DOCUMENTS TAB */}
        {tab === 'documents' && (
          <div className="space-y-4 max-w-3xl">
            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="rounded-xl border-2 border-dashed border-border hover:border-brand-300 transition-colors p-8 text-center cursor-pointer"
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500 mx-auto" />
                  <p className="text-sm font-medium text-foreground">{uploadProgress}</p>
                  <p className="text-xs text-muted-foreground">This may take a moment for large files…</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium text-foreground">Drop files here or click to upload</p>
                  <p className="text-xs text-muted-foreground">Supports: TXT, PDF, MD, CSV, JSON, DOCX, XLSX (max 10MB)</p>
                </div>
              )}
            </div>

            {/* Documents list */}
            {docsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : docs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No documents yet. Upload your first file above.</p>
                <p className="text-xs text-muted-foreground mt-1">Your AI agent will use these to answer customer questions.</p>
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
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => void handleDelete(doc.filename)}
                      disabled={deleting === doc.filename}
                    >
                      {deleting === doc.filename ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VECTOR SANDBOX TAB */}
        {tab === 'sandbox' && (
          <div className="space-y-5 max-w-3xl">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium text-foreground mb-1">Vector KB Sandbox</p>
              <p className="text-xs text-muted-foreground mb-3">Test semantic search — see which chunks your AI will use to answer a customer message.</p>
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. what is your return policy?"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                />
                <Button onClick={() => void handleSearch()} disabled={searching || !searchQuery.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
                <p className="text-sm font-medium text-foreground">No matching chunks found</p>
                <p className="text-xs text-muted-foreground mt-1">Try different keywords or upload more documents</p>
              </div>
            )}

            {searchResults && searchResults.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</p>
                {searchResults.map((result, i) => (
                  <div key={result.id ?? i} className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium text-foreground">{result.filename}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">chunk {result.chunk_index}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <SimilarityBar pct={result.similarity} />
                        <span className={cn(
                          'text-xs font-bold',
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

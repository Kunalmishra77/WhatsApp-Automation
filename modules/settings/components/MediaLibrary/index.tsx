'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, Copy, Trash2, Image, FileVideo, File, ExternalLink, Tag, Sparkles, X, Link2, PackagePlus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MediaItem {
  id: string;
  url?: string;
  path?: string;
  name: string;
  size?: number;
  mimeType?: string;
  media_id?: string;
  public_url?: string;
  filename?: string;
  media_type?: string;
  tags?: string[];
  description?: string;
  created_at?: string;
  last_used_at?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType = '') {
  if (mimeType.startsWith('image/') || mimeType === 'image') return Image;
  if (mimeType.startsWith('video/') || mimeType === 'video')  return FileVideo;
  return File;
}

function timeAgoShort(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Simple uploader: upload a file and copy the public link ────────────────
function GetLinkTab({ workspaceId }: { workspaceId: string }) {
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [resultUrl,  setResultUrl]  = useState('');
  const [resultName, setResultName] = useState('');
  const [dragging,   setDragging]   = useState(false);
  const [recents,    setRecents]    = useState<MediaItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadRecents = async () => {
    const res  = await fetch(`/api/media-library?workspaceId=${workspaceId}&recent=true`);
    if (!res.ok) return;
    const data = await res.json() as { items: MediaItem[] };
    const withUsed = (data.items ?? []).filter((i) => i.last_used_at);
    withUsed.sort((a, b) => new Date(b.last_used_at!).getTime() - new Date(a.last_used_at!).getTime());
    setRecents(withUsed.slice(0, 5));
  };

  useState(() => { void loadRecents(); });

  const markUsed = async (id: string) => {
    await fetch('/api/media-library', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ workspaceId, id, mark_used: true }),
    });
    void loadRecents();
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setProgress(10);
    setResultUrl('');
    setResultName('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);
      setProgress(40);
      const res  = await fetch('/api/media/upload', { method: 'POST', body: form });
      setProgress(80);
      const data = await res.json() as { url?: string; mimeType?: string; error?: string };
      if (!res.ok || data.error) { toast.error(data.error ?? 'Upload failed'); return; }
      const url = data.url ?? '';
      setResultUrl(url);
      setResultName(file.name);
      setProgress(100);
      toast.success('Uploaded! Link ready below.');
      // Save to media-library and mark as recently used
      const mediaType = data.mimeType?.startsWith('video') ? 'video' : data.mimeType?.startsWith('image') ? 'image' : 'document';
      const saved = await fetch('/api/media-library', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, url, mediaType, filename: file.name, tags: [] }),
      });
      if (saved.ok) {
        const savedData = await saved.json() as { item: MediaItem };
        if (savedData.item?.id) await markUsed(savedData.item.id);
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setTimeout(() => { setUploading(false); setProgress(0); }, 600);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleCopy = async (url: string, itemId?: string) => {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied!');
    if (itemId) await markUsed(itemId);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload any image, video or document — get a public URL instantly.
      </p>

      {/* Recently used strip */}
      {recents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recently Used</p>
          <div className="grid grid-cols-1 gap-1.5">
            {recents.map((item) => {
              const url  = item.public_url ?? item.media_id ?? '';
              const name = item.filename ?? item.name ?? 'media';
              const type = item.media_type ?? '';
              const isImg = type === 'image' || type.startsWith('image/');
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2 group">
                  {isImg && url.startsWith('http') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={name} className="h-8 w-8 rounded object-cover shrink-0 border border-border" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                      {getFileIcon(type)({ className: 'h-4 w-4 text-muted-foreground' } as any)}
                    </div>
                  )}
                  <span className="text-xs truncate flex-1 font-medium">{name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgoShort(item.last_used_at!)}</span>
                  <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => void handleCopy(url, item.id)}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) void uploadFile(e.dataTransfer.files[0]); }}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
          dragging ? 'border-brand-500 bg-brand-50/50' : 'border-border hover:border-brand-400 hover:bg-muted/30',
        )}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/*,video/*,.pdf" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) void uploadFile(e.target.files[0]); }} />
        <Upload className={cn('h-8 w-8 mx-auto mb-2', dragging ? 'text-brand-500' : 'text-muted-foreground')} />
        <p className="text-sm font-medium">Click or drag & drop to upload</p>
        <p className="text-xs text-muted-foreground mt-1">Images, Videos, PDF — max 50MB</p>
        {uploading && (
          <div className="mt-3 space-y-1">
            <Progress value={progress} className="h-1.5 max-w-xs mx-auto" />
            <p className="text-xs text-muted-foreground">Uploading…</p>
          </div>
        )}
      </div>

      {/* Result URL */}
      {resultUrl && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-green-800">Public Link — {resultName}</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={resultUrl}
              className="h-8 text-xs font-mono bg-white"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 shrink-0"
              onClick={() => void handleCopy(resultUrl)}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" asChild>
              <a href={resultUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product catalog uploader: upload + tags + description for AI ───────────
function ProductCatalogTab({ workspaceId, queryClient }: { workspaceId: string; queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient> }) {
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [dragging,    setDragging]    = useState(false);
  const [tagInput,    setTagInput]    = useState('');
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !pendingTags.includes(t)) setPendingTags((p) => [...p, t]);
    setTagInput('');
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setProgress(10);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);
      setProgress(40);
      const res  = await fetch('/api/media/upload', { method: 'POST', body: form });
      setProgress(70);
      const data = await res.json() as { url?: string; mimeType?: string; error?: string };
      if (!res.ok || data.error) { toast.error(data.error ?? 'Upload failed'); return; }

      const mediaType = data.mimeType?.startsWith('video') ? 'video' : data.mimeType?.startsWith('image') ? 'image' : 'document';
      await fetch('/api/media-library', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          url:         data.url,
          mediaType,
          filename:    file.name,
          tags:        pendingTags,
          description: description.trim() || undefined,
        }),
      });

      setProgress(100);
      toast.success('Product added to catalog!');
      setPendingTags([]);
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: ['media-library', workspaceId] });
    } catch {
      toast.error('Upload failed');
    } finally {
      setTimeout(() => { setUploading(false); setProgress(0); }, 600);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* AI tip */}
      <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-xs text-purple-800 flex gap-2">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-purple-500" />
        <div>
          <p className="font-semibold">AI Image Auto-Send</p>
          <p>When a customer writes <em>"product photos dikhao"</em>, AI searches tags and sends matching images automatically.</p>
          <p className="mt-1"><strong>Tip:</strong> Use tags like <code className="bg-purple-100 px-1 rounded">product</code>, <code className="bg-purple-100 px-1 rounded">catalog</code>, <code className="bg-purple-100 px-1 rounded">price-list</code></p>
        </div>
      </div>

      {/* Tags + Description */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Add tags before uploading</p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. product, catalog, offer..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }}}
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={addTag}>
            <Tag className="h-3.5 w-3.5" /> Add Tag
          </Button>
        </div>
        {pendingTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pendingTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                {tag}
                <button onClick={() => setPendingTags((p) => p.filter((t) => t !== tag))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          placeholder="Description (optional) — e.g. Summer collection product photos"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) void uploadFile(e.dataTransfer.files[0]); }}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
          dragging ? 'border-brand-500 bg-brand-50/50' : 'border-border hover:border-brand-400 hover:bg-muted/30',
        )}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/*,video/*,.pdf" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) void uploadFile(e.target.files[0]); }} />
        <Upload className={cn('h-8 w-8 mx-auto mb-2', dragging ? 'text-brand-500' : 'text-muted-foreground')} />
        <p className="text-sm font-medium">Click or drag & drop to upload</p>
        <p className="text-xs text-muted-foreground mt-1">Images, Videos — max 50MB</p>
        {uploading && (
          <div className="mt-3 space-y-1">
            <Progress value={progress} className="h-1.5 max-w-xs mx-auto" />
            <p className="text-xs text-muted-foreground">Uploading…</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function MediaLibrary() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'link' | 'product'>('link');
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);

  const { data: dbItems, isLoading } = useQuery({
    queryKey: ['media-library', workspaceId],
    queryFn: async () => {
      const res  = await fetch(`/api/media-library?workspaceId=${workspaceId}`);
      if (!res.ok) return [];
      const data = await res.json() as { items: MediaItem[] };
      return data.items ?? [];
    },
    enabled: !!workspaceId,
  });

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    const params = new URLSearchParams({ path: item.path ?? '', workspaceId });
    await fetch(`/api/media/upload?${params}`, { method: 'DELETE' });
    await fetch(`/api/media-library`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, id: item.id }),
    });
    setPendingDelete(null);
    void queryClient.invalidateQueries({ queryKey: ['media-library', workspaceId] });
    toast.success('Deleted');
  };

  const handleUpdateTags = async (item: MediaItem, newTags: string[]) => {
    await fetch('/api/media-library', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ workspaceId, id: item.id, tags: newTags }),
    });
    void queryClient.invalidateQueries({ queryKey: ['media-library', workspaceId] });
    toast.success('Tags updated');
  };

  const displayItems = dbItems ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Media Library</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Upload media for public links or add to product catalog for AI auto-send.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-lg border border-border bg-muted/40 p-1 gap-1">
        <button
          onClick={() => setTab('link')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
            tab === 'link'
              ? 'bg-white shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Link2 className="h-4 w-4" /> Get Media Link
        </button>
        <button
          onClick={() => setTab('product')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
            tab === 'product'
              ? 'bg-white shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <PackagePlus className="h-4 w-4" /> Add Product to Catalog
        </button>
      </div>

      {/* Tab content */}
      {tab === 'link'
        ? <GetLinkTab workspaceId={workspaceId} />
        : <ProductCatalogTab workspaceId={workspaceId} queryClient={queryClient} />
      }

      {/* Product catalog items */}
      {tab === 'product' && (
        isLoading ? (
          <p className="text-sm text-muted-foreground">Loading catalog…</p>
        ) : displayItems.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{displayItems.length} item{displayItems.length !== 1 ? 's' : ''} in catalog</p>
            {displayItems.map((item) => {
              const url     = item.public_url ?? item.media_id ?? item.url ?? '';
              const name    = item.filename ?? item.name ?? 'media';
              const type    = item.media_type ?? item.mimeType ?? '';
              const Icon    = getFileIcon(type);
              const isImage = type === 'image' || type.startsWith('image/');

              return (
                <div key={item.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                  {isImage && url.startsWith('http') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={name} className="h-14 w-14 rounded-lg object-cover shrink-0 border border-border" />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium truncate">{name}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                    <div className="flex flex-wrap gap-1">
                      {(item.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                          <Tag className="h-2.5 w-2.5" /> {tag}
                          <button className="hover:text-destructive" onClick={() => {
                            const newTags = (item.tags ?? []).filter((t) => t !== tag);
                            void handleUpdateTags(item, newTags);
                          }}><X className="h-2.5 w-2.5" /></button>
                        </Badge>
                      ))}
                      <AddTagInline onAdd={(tag) => void handleUpdateTags(item, [...(item.tags ?? []), tag])} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy URL"
                      onClick={() => {
                        void navigator.clipboard.writeText(url);
                        toast.success('URL copied!');
                        void fetch('/api/media-library', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ workspaceId, id: item.id, mark_used: true }),
                        });
                      }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                      <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No products in catalog yet.</p>
        )
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete file?"
        description={`"${pendingDelete?.filename ?? pendingDelete?.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function AddTagInline({ onAdd }: { onAdd: (tag: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState('');

  const submit = () => {
    const t = val.trim().toLowerCase();
    if (t) onAdd(t);
    setVal(''); setEditing(false);
  };

  if (!editing) return (
    <button onClick={() => setEditing(true)} className="text-[10px] text-brand-600 hover:underline flex items-center gap-0.5">
      <Tag className="h-2.5 w-2.5" /> Add tag
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      <Input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setEditing(false); }}
        className="h-5 text-[10px] px-1 w-20" placeholder="tag..." />
      <button onClick={submit} className="text-[10px] text-green-600">✓</button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-muted-foreground">✗</button>
    </div>
  );
}

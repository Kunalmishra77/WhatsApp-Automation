'use client';

import { useState, useRef } from 'react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Copy, Trash2, Image, FileVideo, File, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MediaItem {
  url:      string;
  path:     string;
  name:     string;
  size:     number;
  mimeType: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return FileVideo;
  return File;
}

export function MediaLibrary() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [items,    setItems]    = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [dragging,  setDragging]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setProgress(10);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);

      setProgress(40);
      const res  = await fetch('/api/media/upload', { method: 'POST', body: form });
      setProgress(80);
      const data = await res.json() as { url?: string; path?: string; size?: number; mimeType?: string; error?: string };

      if (!res.ok || data.error) { toast.error(data.error ?? 'Upload failed'); return; }

      const newItem: MediaItem = {
        url:      data.url!,
        path:     data.path!,
        name:     file.name,
        size:     data.size!,
        mimeType: data.mimeType!,
      };

      setItems((prev) => [newItem, ...prev]);
      setProgress(100);
      toast.success('Uploaded! URL copied to clipboard.');
      await navigator.clipboard.writeText(data.url!).catch(() => {});
    } catch {
      toast.error('Upload failed');
    } finally {
      setTimeout(() => { setUploading(false); setProgress(0); }, 600);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    void uploadFile(files[0]!);
  };

  const handleDelete = async (item: MediaItem) => {
    const params = new URLSearchParams({ path: item.path, workspaceId });
    await fetch(`/api/media/upload?${params}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.path !== item.path));
    toast.success('Deleted');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Media Library</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload photos/videos → get a public URL → use directly in campaign broadcasts.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer',
          dragging ? 'border-brand-500 bg-brand-50/50' : 'border-border hover:border-brand-400 hover:bg-muted/30',
        )}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,.pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className={cn('h-8 w-8 mx-auto mb-3', dragging ? 'text-brand-500' : 'text-muted-foreground')} />
        <p className="text-sm font-medium text-foreground">Click or drag & drop to upload</p>
        <p className="text-xs text-muted-foreground mt-1">Images, Videos, PDFs — max 50MB</p>
        {uploading && (
          <div className="mt-4 space-y-1">
            <Progress value={progress} className="h-1.5 max-w-xs mx-auto" />
            <p className="text-xs text-muted-foreground">Uploading…</p>
          </div>
        )}
      </div>

      {/* Uploaded items */}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{items.length} file{items.length !== 1 ? 's' : ''} this session</p>
          {items.map((item) => {
            const Icon = getFileIcon(item.mimeType);
            return (
              <div key={item.path} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                {item.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.name} className="h-12 w-12 rounded-lg object-cover shrink-0 border border-border" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(item.size)}</p>
                  <p className="text-[11px] text-brand-600 truncate font-mono mt-0.5">{item.url}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    title="Copy URL"
                    onClick={() => { void navigator.clipboard.writeText(item.url); toast.success('URL copied!'); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                    <a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleDelete(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Campaign mein use kaise karein:</p>
        <p>1. Yahan se photo upload karo → URL automatically clipboard mein copy ho jaayega</p>
        <p>2. Campaign wizard → Media step mein URL paste karo (ya direct file upload karo)</p>
        <p>3. Bulk send mein ye URL image ke saath jaayega har contact ko</p>
      </div>
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_META } from './types';
import type { KBEntryDraft } from './types';

interface UploadTabProps {
  workspaceId: string;
  onImport: (entries: KBEntryDraft[], source: string, filename?: string) => Promise<void>;
  isImporting: boolean;
}

const ACCEPTED = '.txt,.md,.csv,.json';
const FORMAT_GUIDE = `CSV format (title, content, category, tags):
"Return Policy","We accept returns within 30 days...","returns","return;refund"
"Pricing","Our plans start at ₹999/month...","pricing","cost;plans"

JSON format:
[{"title":"...","content":"...","category":"faq","tags":["tag1"]}]

TXT/MD: Just paste your company document — AI will extract Q&A entries automatically.`;

export function UploadTab({ workspaceId, onImport, isImporting }: UploadTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [filename, setFilename] = useState('');
  const [fileType, setFileType] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<KBEntryDraft[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'txt';
    const text = await file.text();
    setFilename(file.name);
    setFileType(ext);
    setPasteText(text);
    await parseAndPreview(text, ext, file.name);
  };

  const parseAndPreview = async (text: string, ext: string, name: string) => {
    if (!text.trim()) return;
    setIsParsing(true);
    setPreview(null);
    try {
      const res = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, text, filename: name, fileType: ext }),
      });
      const data = await res.json() as { entries?: KBEntryDraft[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed');
      const entries = data.entries ?? [];
      setPreview(entries);
      setSelected(new Set(entries.map((_, i) => i)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Parsing failed');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  };

  const handleParsePaste = () => {
    if (pasteText.trim()) {
      void parseAndPreview(pasteText, fileType || 'txt', filename || 'pasted-document');
    }
  };

  const handleImport = async () => {
    if (!preview || selected.size === 0) return;
    const toImport = preview.filter((_, i) => selected.has(i));
    await onImport(toImport, 'file', filename || undefined);
    setPreview(null);
    setPasteText('');
    setFilename('');
    setSelected(new Set());
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-sm">Upload Company Document</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Upload a TXT, MD, CSV, or JSON file. AI automatically extracts knowledge base entries.
          For PDF or DOCX — paste the text below.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => void handleDrop(e)}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all',
          isDragging ? 'border-brand-400 bg-brand-50' : 'border-border hover:border-brand-300 hover:bg-muted/30',
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Drop file here or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">Supports .txt, .md, .csv, .json</p>
        {filename && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs text-brand-700">
            <FileText className="h-3 w-3" />
            {filename}
          </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">or paste text / PDF content</span></div>
      </div>

      {/* Paste area */}
      <div className="space-y-2">
        <Textarea
          placeholder={FORMAT_GUIDE}
          rows={6}
          className="text-xs font-mono"
          value={pasteText}
          onChange={(e) => { setPasteText(e.target.value); setFilename(''); setPreview(null); }}
        />
        <div className="flex gap-2">
          <input
            className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-xs"
            placeholder="Document name (optional)"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
          >
            <option value="txt">TXT / MD</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <Button size="sm" className="h-8" onClick={handleParsePaste} disabled={!pasteText.trim() || isParsing}>
            {isParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Parse'}
          </Button>
        </div>
      </div>

      {/* Preview */}
      {isParsing && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          AI is extracting knowledge base entries…
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{preview.length} entries extracted — select which to import:</p>
            <button
              className="text-xs text-brand-600 hover:underline"
              onClick={() => setSelected(
                selected.size === preview.length ? new Set() : new Set(preview.map((_, i) => i))
              )}
            >
              {selected.size === preview.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {preview.map((entry, i) => {
              const catMeta = CATEGORY_META[entry.category] ?? CATEGORY_META["general"]!;
              return (
                <div
                  key={i}
                  onClick={() => {
                    const next = new Set(selected);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    setSelected(next);
                  }}
                  className={cn(
                    'cursor-pointer rounded-lg border p-3 transition-all select-none',
                    selected.has(i) ? 'border-brand-400 bg-white' : 'border-border bg-white/50 opacity-60',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {selected.has(i)
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                      : <div className="h-3.5 w-3.5 rounded-full border border-border shrink-0" />}
                    <span className="font-medium text-sm">{entry.title}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', catMeta.color)}>{catMeta.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 pl-5">{entry.content}</p>
                  {(entry.tags?.length ?? 0) > 0 && (
                    <div className="flex gap-1 mt-1.5 pl-5 flex-wrap">
                      {entry.tags?.map((t) => (
                        <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            className="w-full"
            onClick={() => void handleImport()}
            disabled={isImporting || selected.size === 0}
          >
            {isImporting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>
              : <><CheckCircle2 className="h-4 w-4 mr-2" />Import {selected.size} entries</>}
          </Button>
        </div>
      )}

      {preview && preview.length === 0 && !isParsing && (
        <p className="text-center text-sm text-muted-foreground py-4">No entries could be extracted. Try a different format or add more content.</p>
      )}
    </div>
  );
}

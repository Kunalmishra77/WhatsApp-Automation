'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Upload, CheckCircle2, AlertCircle, Sparkles, FileText, Loader2 } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'parsing' | 'preview' | 'importing' | 'done';
interface ParsedRow { name?: string; phone: string; email?: string; company?: string; tags?: string[] }

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

const ACCEPTED = '.csv,.xlsx,.xls,.txt,.pdf,.vcf,.json';

function fileTypeLabel(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    csv: 'CSV', xlsx: 'Excel', xls: 'Excel', txt: 'Text', pdf: 'PDF', vcf: 'vCard', json: 'JSON',
  };
  return map[ext] ?? ext.toUpperCase();
}

export function ImportWizard({ open, onClose }: ImportWizardProps) {
  const [step, setStep]       = useState<ImportStep>('upload');
  const [rows, setRows]       = useState<ParsedRow[]>([]);
  const [result, setResult]   = useState<{ inserted: number; skipped: number; failed: number; lastError?: string } | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [aiUsed, setAiUsed]   = useState(false);
  const fileRef               = useRef<HTMLInputElement>(null);
  const workspaceId           = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const queryClient           = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setAiUsed(false);
    setStep('parsing');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      let parsed: ParsedRow[] = [];

      if (ext === 'csv' || ext === 'txt') {
        parsed = await parseCSV(file);
        // If CSV parse gives no results, try AI
        if (parsed.length === 0) {
          parsed = await parseWithAI(file, workspaceId ?? '');
          setAiUsed(true);
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        parsed = await parseExcel(file);
      } else if (ext === 'vcf') {
        parsed = await parseVCard(file);
      } else if (ext === 'json') {
        parsed = await parseJSON(file);
      } else {
        // PDF or any unknown — use AI
        parsed = await parseWithAI(file, workspaceId ?? '');
        setAiUsed(true);
      }

      if (parsed.length === 0) {
        setError('No valid contacts found. Make sure file has phone numbers.');
        setStep('upload');
        return;
      }

      setRows(parsed);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setStep('upload');
    }
  };

  const handleImport = async () => {
    if (!workspaceId) return;
    setStep('importing');
    setProgress(10);
    try {
      // Use server-side API — handles batching + upsert properly for large sets
      const res = await fetch('/api/contacts/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, contacts: rows }),
      });
      const data = await res.json() as { inserted?: number; skipped?: number; failed?: number; lastError?: string; error?: string; code?: string };
      if (!res.ok) {
        if (data.code === 'PLAN_LIMIT_EXCEEDED') {
          setError(data.error ?? 'Contact limit reached on your current plan.');
        } else {
          setError(data.error ?? 'Import failed — please try again.');
        }
        setStep('preview');
        return;
      }
      setProgress(100);
      const insertedCount = data.inserted ?? 0;
      const skippedCount  = data.skipped ?? (rows.length - insertedCount - (data.failed ?? 0));
      const failedCount   = data.failed ?? 0;
      setResult({ inserted: insertedCount, skipped: skippedCount, failed: failedCount, lastError: data.lastError });
      setStep('done');
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      if (failedCount > 0 && insertedCount === 0) {
        toast.error(`Import error — ${failedCount} contacts failed. Check logs.`);
      } else {
        toast.success(`✅ Imported ${insertedCount} contacts`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed — please try again.');
      setStep('preview');
    }
  };

  const handleClose = () => {
    setStep('upload'); setRows([]); setResult(null);
    setError(null); setProgress(0); setFileName(''); setAiUsed(false);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Contacts
          </DialogTitle>
        </DialogHeader>

        {/* UPLOAD */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700 space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AI-powered import</p>
              <p>Supports: <strong>CSV, Excel, PDF, vCard, Text, JSON</strong> — AI automatically detects names, phones, emails from any format.</p>
            </div>

            <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-brand-500 hover:bg-brand-500/5 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">CSV · Excel · PDF · vCard · Text · JSON</p>
              </div>
              <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFile} />
            </label>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        {/* PARSING */}
        {step === 'parsing' && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500 mx-auto" />
            <p className="text-sm font-medium">Parsing {fileTypeLabel(fileName)} file…</p>
            <p className="text-xs text-muted-foreground">AI is extracting contact details</p>
          </div>
        )}

        {/* PREVIEW */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm">
                Found <strong>{rows.length}</strong> contacts in <strong>{fileName}</strong>
                {aiUsed && <span className="ml-1 text-xs text-purple-600 font-medium">(AI extracted)</span>}
              </p>
            </div>

            <div className="rounded-md border border-border overflow-auto max-h-52">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {['Phone', 'Name', 'Email', 'Company'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-mono">{row.phone}</td>
                      <td className="px-3 py-1.5">{row.name ?? '—'}</td>
                      <td className="px-3 py-1.5">{row.email ?? '—'}</td>
                      <td className="px-3 py-1.5">{row.company ?? '—'}</td>
                    </tr>
                  ))}
                  {rows.length > 10 && (
                    <tr className="border-t border-border">
                      <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground text-center">
                        +{rows.length - 10} more contacts
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setStep('upload'); setRows([]); }}>
                Change File
              </Button>
              <Button className="flex-1" onClick={handleImport}>
                Import {rows.length} Contacts
              </Button>
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {step === 'importing' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Importing {rows.length} contacts…</p>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* DONE */}
        {step === 'done' && result && (
          <div className="py-6 text-center space-y-3">
            {result.failed > 0 && result.inserted === 0
              ? <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
              : <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            }
            <p className="text-lg font-semibold">
              {result.failed > 0 && result.inserted === 0 ? 'Import Failed' : 'Import Complete!'}
            </p>
            <div className="flex justify-center gap-6 text-sm">
              <div><p className="text-2xl font-bold text-green-600">{result.inserted}</p><p className="text-muted-foreground">Added</p></div>
              <div><p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p><p className="text-muted-foreground">Skipped</p></div>
              {result.failed > 0 && (
                <div><p className="text-2xl font-bold text-red-500">{result.failed}</p><p className="text-muted-foreground">Failed</p></div>
              )}
            </div>
            {result.lastError && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mx-4">Error: {result.lastError}</p>
            )}
            <Button onClick={handleClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Parsers ───────────────────────────────────────────────────────────────────

async function parseCSV(file: File): Promise<ParsedRow[]> {
  const Papa = (await import('papaparse')).default;
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^﻿/, '').trim(), // strip BOM from headers
      complete: (results) => {
        // Case-insensitive column lookup
        const colOf = (row: Record<string, unknown>, ...keys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const k of keys) {
            // exact match first
            if (k in row) return String(row[k] ?? '').trim();
            // case-insensitive fallback
            const found = rowKeys.find((rk) => rk.toLowerCase() === k.toLowerCase());
            if (found) return String(row[found] ?? '').trim();
          }
          // last resort: any column whose name includes any key word
          for (const k of keys) {
            const found = rowKeys.find((rk) => rk.toLowerCase().includes(k.toLowerCase()));
            if (found) return String(row[found] ?? '').trim();
          }
          return '';
        };

        const parsed = results.data.map((row) => ({
          phone:   colOf(row, 'phone', 'mobile', 'number', 'whatsapp', 'contact', 'tel', 'cell'),
          name:    colOf(row, 'name', 'full_name', 'fullname', 'full name', 'customer') || undefined,
          email:   colOf(row, 'email', 'e-mail', 'mail') || undefined,
          company: colOf(row, 'company', 'organization', 'org', 'business') || undefined,
        })).filter((r) => r.phone.length > 5);
        resolve(parsed);
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

async function parseExcel(file: File): Promise<ParsedRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return data.map((row) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
        if (v) return String(v).trim();
      }
      return '';
    };
    return {
      phone:   get('phone', 'Phone', 'mobile', 'Mobile', 'number', 'Number', 'contact'),
      name:    get('name', 'Name', 'full_name', 'Full Name') || undefined,
      email:   get('email', 'Email') || undefined,
      company: get('company', 'Company', 'organization', 'Organization') || undefined,
    };
  }).filter((r) => r.phone.length > 5);
}

async function parseVCard(file: File): Promise<ParsedRow[]> {
  const text = await file.text();
  const contacts: ParsedRow[] = [];
  const cards = text.split('BEGIN:VCARD');
  for (const card of cards) {
    if (!card.trim()) continue;
    const phone = card.match(/TEL[^:]*:([^\r\n]+)/)?.[1]?.trim().replace(/\s/g, '') ?? '';
    const name  = card.match(/FN:([^\r\n]+)/)?.[1]?.trim() ?? '';
    const email = card.match(/EMAIL[^:]*:([^\r\n]+)/)?.[1]?.trim() ?? '';
    if (phone) contacts.push({ phone, name: name || undefined, email: email || undefined });
  }
  return contacts;
}

async function parseJSON(file: File): Promise<ParsedRow[]> {
  const text = await file.text();
  const data = JSON.parse(text) as unknown;
  const arr  = Array.isArray(data) ? data : (data as Record<string, unknown[]>)[Object.keys(data as object)[0]!] ?? [];
  return (arr as Record<string, unknown>[]).map((row) => ({
    phone:   String(row['phone'] ?? row['mobile'] ?? row['number'] ?? '').trim(),
    name:    String(row['name'] ?? row['full_name'] ?? '').trim() || undefined,
    email:   String(row['email'] ?? '').trim() || undefined,
    company: String(row['company'] ?? row['organization'] ?? '').trim() || undefined,
  })).filter((r) => r.phone.length > 5);
}

async function parseWithAI(file: File, workspaceId: string): Promise<ParsedRow[]> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', workspaceId);

  const res  = await fetch('/api/contacts/parse-ai', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('AI parsing failed');
  const data = await res.json() as { contacts: ParsedRow[] };
  return data.contacts ?? [];
}

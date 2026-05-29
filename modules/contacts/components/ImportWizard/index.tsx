'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { bulkImportContacts } from '../../services/contact.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'preview' | 'importing' | 'done';
interface ParsedRow { name?: string; phone: string; email?: string; company?: string }

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

export function ImportWizard({ open, onClose }: ImportWizardProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const queryClient = useQueryClient();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: ParsedRow[] = results.data
          .map((row) => ({
            phone:   (row['phone'] ?? row['Phone'] ?? row['PHONE'] ?? '').trim(),
            name:    (row['name'] ?? row['Name'] ?? row['full_name'] ?? '').trim() || undefined,
            email:   (row['email'] ?? row['Email'] ?? '').trim() || undefined,
            company: (row['company'] ?? row['Company'] ?? '').trim() || undefined,
          }))
          .filter((r) => r.phone.length > 0);

        if (parsed.length === 0) {
          setError('No valid rows with phone numbers found. CSV must have a "phone" column.');
          return;
        }
        setRows(parsed);
        setError(null);
        setStep('preview');
      },
      error: (err) => setError(err.message),
    });
  };

  const handleImport = async () => {
    if (!workspaceId) return;
    setStep('importing');
    setProgress(10);
    try {
      const res = await bulkImportContacts(workspaceId, rows);
      setProgress(100);
      setResult(res);
      setStep('done');
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      toast.success(`Imported ${res.inserted} contacts`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setRows([]);
    setResult(null);
    setError(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with columns: <code className="text-xs bg-muted px-1 rounded">phone</code> (required),{' '}
              <code className="text-xs bg-muted px-1 rounded">name</code>,{' '}
              <code className="text-xs bg-muted px-1 rounded">email</code>,{' '}
              <code className="text-xs bg-muted px-1 rounded">company</code>
            </p>
            <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-brand-500 hover:bg-brand-500/5 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to select CSV file</span>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </label>
            {error && (
              <Alert variant="destructive" className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </Alert>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Found <strong>{rows.length}</strong> contacts.{rows.length > 5 && ` Showing first 5.`}
            </p>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    {['Phone', 'Name', 'Email', 'Company'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{row.phone}</td>
                      <td className="px-3 py-2">{row.name ?? '—'}</td>
                      <td className="px-3 py-2">{row.email ?? '—'}</td>
                      <td className="px-3 py-2">{row.company ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && (
              <Alert variant="destructive" className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </Alert>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Importing {rows.length} contacts…</p>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-base font-semibold text-foreground">Import Complete</p>
            <p className="text-sm text-muted-foreground">
              {result.inserted} imported · {result.skipped} skipped (duplicates)
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); if (fileRef.current) fileRef.current.value = ''; }}>
                Back
              </Button>
              <Button onClick={() => void handleImport()}>
                Import {rows.length} Contacts
              </Button>
            </>
          )}
          {(step === 'done' || step === 'upload') && (
            <Button onClick={handleClose}>{step === 'done' ? 'Done' : 'Cancel'}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Sparkles, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_META } from './types';
import type { KBEntryDraft } from './types';

interface GenerateTabProps {
  workspaceId: string;
  onImport: (entries: KBEntryDraft[], source: string) => Promise<void>;
  isImporting: boolean;
}

interface CompanyForm {
  companyName: string;
  industry: string;
  productsServices: string;
  pricing: string;
  supportHours: string;
  location: string;
  refundPolicy: string;
  contactInfo: string;
  additionalInfo: string;
}

const EMPTY_FORM: CompanyForm = {
  companyName: '',
  industry: '',
  productsServices: '',
  pricing: '',
  supportHours: '',
  location: '',
  refundPolicy: '',
  contactInfo: '',
  additionalInfo: '',
};

export function GenerateTab({ workspaceId, onImport, isImporting }: GenerateTabProps) {
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<KBEntryDraft[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<KBEntryDraft | null>(null);

  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const buildDescription = () => {
    const parts = [];
    if (form.companyName) parts.push(`Company: ${form.companyName}`);
    if (form.industry) parts.push(`Industry: ${form.industry}`);
    if (form.productsServices) parts.push(`Products/Services: ${form.productsServices}`);
    if (form.pricing) parts.push(`Pricing: ${form.pricing}`);
    if (form.supportHours) parts.push(`Support hours: ${form.supportHours}`);
    if (form.location) parts.push(`Location/Timezone: ${form.location}`);
    if (form.refundPolicy) parts.push(`Refund/Return policy: ${form.refundPolicy}`);
    if (form.contactInfo) parts.push(`Contact: ${form.contactInfo}`);
    if (form.additionalInfo) parts.push(`Additional: ${form.additionalInfo}`);
    return parts.join('\n');
  };

  const isFormFilled = form.companyName.trim() && (form.productsServices.trim() || form.industry.trim());

  const handleGenerate = async () => {
    const desc = buildDescription();
    if (!desc.trim()) { toast.error('Fill in at least company name and products/services'); return; }

    setIsGenerating(true);
    setGenerated(null);
    try {
      const res = await fetch('/api/knowledge-base/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, companyDescription: desc }),
      });
      const data = await res.json() as { entries?: KBEntryDraft[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setGenerated(data.entries ?? []);
      setSelected(new Set((data.entries ?? []).map((_, i) => i)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const saveEdit = () => {
    if (editingIdx === null || !editDraft || !generated) return;
    const next = [...generated];
    next[editingIdx] = editDraft;
    setGenerated(next);
    setEditingIdx(null);
    setEditDraft(null);
  };

  const handleImport = async () => {
    if (!generated || selected.size === 0) return;
    const toImport = generated.filter((_, i) => selected.has(i));
    await onImport(toImport, 'ai');
    setGenerated(null);
    setSelected(new Set());
    setForm(EMPTY_FORM);
  };

  return (
    <div className="space-y-6">
      {!generated ? (
        <>
          <div>
            <h3 className="font-medium text-sm">Generate Knowledge Base with AI</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fill in your company details — AI will generate a complete, professional knowledge base tailored to your business.
              The more details you provide, the better the results.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Company Name *</Label>
              <Input placeholder="e.g. V4TOU Tech" value={form.companyName} onChange={set('companyName')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Industry / Business Type *</Label>
              <Input placeholder="e.g. SaaS, E-commerce, Consulting" value={form.industry} onChange={set('industry')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Products / Services *</Label>
            <Textarea
              placeholder="Describe what you sell or offer. Include key features, variants, use cases.
e.g. WhatsApp automation platform with AI replies, broadcast campaigns, CRM, chatbot builder"
              rows={3}
              value={form.productsServices}
              onChange={set('productsServices')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Pricing</Label>
              <Textarea
                placeholder="e.g. Starter ₹999/month, Pro ₹2499/month. Free 14-day trial."
                rows={2}
                value={form.pricing}
                onChange={set('pricing')}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Support Hours</Label>
              <Input placeholder="e.g. Mon-Sat 10am-6pm IST" value={form.supportHours} onChange={set('supportHours')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Location / Timezone</Label>
              <Input placeholder="e.g. India (IST), Mumbai" value={form.location} onChange={set('location')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Info</Label>
              <Input placeholder="e.g. support@company.com, +91-XXXXXXXXXX" value={form.contactInfo} onChange={set('contactInfo')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Return / Refund Policy</Label>
            <Input placeholder="e.g. 30-day money-back guarantee, no questions asked" value={form.refundPolicy} onChange={set('refundPolicy')} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Additional Info (optional)</Label>
            <Textarea
              placeholder="Any other important details — unique selling points, certifications, awards, common FAQs, shipping info, etc."
              rows={2}
              value={form.additionalInfo}
              onChange={set('additionalInfo')}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !isFormFilled}
          >
            {isGenerating
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating Knowledge Base…</>
              : <><Sparkles className="h-4 w-4 mr-2" />Generate Knowledge Base</>}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">{generated.length} entries generated</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Select entries to import. Click an entry to edit before importing.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleGenerate()} disabled={isGenerating}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Regenerate
              </Button>
              <button className="text-xs text-brand-500 hover:underline" onClick={() => setSelected(
                selected.size === generated.length ? new Set() : new Set(generated.map((_, i) => i))
              )}>
                {selected.size === generated.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {generated.map((entry, i) => {
              const catMeta = CATEGORY_META[entry.category] ?? CATEGORY_META["general"]!;
              const isEditing = editingIdx === i;

              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border transition-all',
                    selected.has(i) ? 'border-brand-300 bg-brand-50/60' : 'border-border bg-card opacity-60',
                  )}
                >
                  {isEditing && editDraft ? (
                    <div className="p-3 space-y-2">
                      <Input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} className="text-sm font-medium" />
                      <Textarea value={editDraft.content} rows={4} onChange={(e) => setEditDraft({ ...editDraft, content: e.target.value })} className="text-sm" />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setEditingIdx(null)}>Cancel</Button>
                        <Button size="sm" onClick={saveEdit}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-start gap-2.5 p-3 cursor-pointer"
                      onClick={() => {
                        const next = new Set(selected);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        setSelected(next);
                      }}
                    >
                      {selected.has(i)
                        ? <CheckCircle2 className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
                        : <div className="h-4 w-4 rounded-full border-2 border-border mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-medium text-sm">{entry.title}</span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', catMeta.color)}>{catMeta.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{entry.content}</p>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 text-xs shrink-0"
                        onClick={(e) => { e.stopPropagation(); setEditingIdx(i); setEditDraft({ ...entry }); }}
                      >Edit</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setGenerated(null); }}>
              Back to Form
            </Button>
            <Button
              className="flex-1"
              onClick={() => void handleImport()}
              disabled={isImporting || selected.size === 0}
            >
              {isImporting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>
                : `Import ${selected.size} entries`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

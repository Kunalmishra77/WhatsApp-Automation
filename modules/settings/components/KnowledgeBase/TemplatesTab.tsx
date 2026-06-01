'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILT_IN_TEMPLATES } from './agentix-template';
import { CATEGORY_META } from './types';
import type { KBEntryDraft } from './types';

interface TemplatesTabProps {
  onImport: (entries: KBEntryDraft[], source: string, filename?: string) => Promise<void>;
  isImporting: boolean;
}

export function TemplatesTab({ onImport, isImporting }: TemplatesTabProps) {
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>('agentix');
  const [selectedEntries, setSelectedEntries] = useState<Record<string, Set<number>>>({});
  const [importingId, setImportingId] = useState<string | null>(null);

  const getSelected = (id: string, count: number) =>
    selectedEntries[id] ?? new Set(Array.from({ length: count }, (_, i) => i));

  const setSelected = (id: string, sel: Set<number>) =>
    setSelectedEntries((prev) => ({ ...prev, [id]: sel }));

  const handleImport = async (templateId: string) => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const sel = getSelected(templateId, template.entries.length);
    const toImport = template.entries.filter((_, i) => sel.has(i));
    if (toImport.length === 0) { toast.error('Select at least one entry'); return; }
    setImportingId(templateId);
    await onImport(toImport as KBEntryDraft[], 'template', `${template.name} Template`);
    setImportingId(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-sm">Ready-Made Templates</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Import a pre-built knowledge base for your industry. Customize entries after importing.
        </p>
      </div>

      {BUILT_IN_TEMPLATES.map((template) => {
        const isExpanded = expandedTemplate === template.id;
        const sel = getSelected(template.id, template.entries.length);
        const isLoadingThis = importingId === template.id;

        return (
          <div key={template.id} className={cn('rounded-xl border transition-all', isExpanded ? 'border-brand-300 shadow-sm' : 'border-border')}>
            {/* Template header */}
            <div
              className="flex items-start gap-3 p-4 cursor-pointer"
              onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{template.name}</span>
                  {template.recommended && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                      <Star className="h-2.5 w-2.5" /> Recommended
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {template.entryCount} entries
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">Industry: {template.industry}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isExpanded && (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={isImporting}
                    onClick={(e) => { e.stopPropagation(); void handleImport(template.id); }}
                  >
                    {isLoadingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Import All'}
                  </Button>
                )}
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>

            {/* Expanded entries */}
            {isExpanded && (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{sel.size} of {template.entries.length} selected</span>
                  <button
                    className="text-xs text-brand-500 hover:underline"
                    onClick={() => setSelected(
                      template.id,
                      sel.size === template.entries.length
                        ? new Set()
                        : new Set(template.entries.map((_, i) => i)),
                    )}
                  >
                    {sel.size === template.entries.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {template.entries.map((entry, i) => {
                    const catMeta = CATEGORY_META[entry.category] ?? CATEGORY_META["general"]!;
                    const isSel = sel.has(i);
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          const next = new Set(sel);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          setSelected(template.id, next);
                        }}
                        className={cn(
                          'cursor-pointer select-none rounded-lg border p-2.5 transition-all',
                          isSel ? 'border-brand-300 bg-brand-50/60' : 'border-border opacity-55',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {isSel
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-brand-500 mt-0.5 shrink-0" />
                            : <div className="h-3.5 w-3.5 rounded-full border-2 border-border mt-0.5 shrink-0" />}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium">{entry.title}</span>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', catMeta.color)}>{catMeta.label}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{entry.content}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  className="w-full"
                  onClick={() => void handleImport(template.id)}
                  disabled={isImporting || sel.size === 0}
                >
                  {isLoadingThis
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>
                    : <><CheckCircle2 className="h-4 w-4 mr-2" />Import {sel.size} entries</>}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, ChevronDown, ChevronUp, Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KBEntry } from './types';
import { CATEGORY_META, SOURCE_META, CATEGORIES } from './types';

interface EntryListProps {
  entries: KBEntry[];
  onEdit: (entry: KBEntry) => void;
  onDelete: (id: string) => void;
  onToggle: (entry: KBEntry) => void;
}

export function EntryList({ entries, onEdit, onDelete, onToggle }: EntryListProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) || e.tags?.some((t) => t.toLowerCase().includes(q));
    const matchCat = filterCategory === 'all' || e.category === filterCategory;
    const matchSrc = filterSource === 'all' || e.source === filterSource;
    return matchSearch && matchCat && matchSrc;
  });

  const activeCount = entries.filter((e) => e.is_active).length;

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">No entries yet. Use Upload, AI Generate, or Templates to add your first entries.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{entries.length} entries</span>
        <span>•</span>
        <span>{activeCount} active</span>
        <span>•</span>
        <span>{entries.length - activeCount} inactive</span>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search entries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_META[c]?.label ?? c}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="all">All sources</option>
          <option value="manual">Manual</option>
          <option value="file">Uploaded</option>
          <option value="ai">AI Generated</option>
          <option value="template">Template</option>
        </select>
        {(search || filterCategory !== 'all' || filterSource !== 'all') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSearch(''); setFilterCategory('all'); setFilterSource('all'); }}>
            <Filter className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No entries match your filters.</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((entry) => {
            const catMeta = CATEGORY_META[entry.category] ?? CATEGORY_META["general"]!;
            const srcMeta = SOURCE_META[entry.source] ?? SOURCE_META['manual']!;
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className={cn(
                  'rounded-lg border border-border bg-card transition-all',
                  !entry.is_active && 'opacity-55',
                )}
              >
                <div className="flex items-start gap-3 px-3.5 py-2.5">
                  <Switch
                    checked={entry.is_active}
                    onCheckedChange={() => onToggle(entry)}
                    className="shrink-0 mt-0.5"
                  />
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="font-medium text-sm leading-tight">{entry.title}</span>
                      <span className={cn('shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border', catMeta.color)}>
                        {catMeta.label}
                      </span>
                      <span className={cn('shrink-0 text-[10px] px-1.5 py-0.5 rounded-full', srcMeta.color)}>
                        {srcMeta.icon} {srcMeta.label}
                      </span>
                      {entry.tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{tag}</span>
                      ))}
                      {(entry.tags?.length ?? 0) > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{(entry.tags?.length ?? 0) - 2}</span>
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 pr-2">{entry.content}</p>
                    )}
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                    <span className="text-[10px] text-muted-foreground mr-1">{entry.char_count ? `${entry.char_count}c` : ''}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(entry)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60 hover:text-destructive" onClick={() => onDelete(entry.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <button onClick={() => setExpandedId(isExpanded ? null : entry.id)} className="p-1 text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border px-3.5 py-2.5 bg-muted/30">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{entry.content}</p>
                    {entry.source_filename && (
                      <p className="mt-2 text-[11px] text-muted-foreground">Source: {entry.source_filename}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

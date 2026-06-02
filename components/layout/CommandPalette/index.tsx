'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Users, Kanban, Megaphone, FileText,
  BarChart3, Settings, Users2, Phone, Search, Loader2, GitBranch, BookOpen,
} from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { useUIStore } from '@/store/ui.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { format } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

const PAGES: Array<{ href: string; icon: LucideIcon; label: string }> = [
  { href: '/conversations',  icon: MessageSquare, label: 'Conversations'  },
  { href: '/contacts',       icon: Users,         label: 'Contacts'       },
  { href: '/crm',            icon: Kanban,        label: 'CRM Pipeline'   },
  { href: '/campaigns',      icon: Megaphone,     label: 'Campaigns'      },
  { href: '/templates',      icon: FileText,      label: 'Templates'      },
  { href: '/flows',          icon: GitBranch,     label: 'Flows'          },
  { href: '/team',           icon: Users2,        label: 'Team'           },
  { href: '/analytics',      icon: BarChart3,     label: 'Analytics'      },
  { href: '/knowledge-base', icon: BookOpen,      label: 'Knowledge Base' },
  { href: '/settings',       icon: Settings,      label: 'Settings'       },
];

interface SearchResult {
  contacts:      Array<{ id: string; name: string | null; phone: string; tags?: string[] }>;
  conversations: Array<{ id: string; status: string; contacts: { name: string | null; phone: string } | null }>;
  messages:      Array<{ id: string; content: string; type: string; created_at: string; conversation_id: string; direction: string }>;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function CommandPalette() {
  const open                 = useUIStore((s) => s.commandPaletteOpen);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const router               = useRouter();
  const workspaceId          = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2 || !workspaceId) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&workspaceId=${workspaceId}`);
      const data = await res.json() as SearchResult;
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void doSearch(debouncedQuery); }, [debouncedQuery, doSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleCommandPalette]);

  function runCommand(fn: () => void) {
    toggleCommandPalette();
    setQuery('');
    setResults(null);
    fn();
  }

  const hasResults = results && (
    results.contacts.length > 0 ||
    results.conversations.length > 0 ||
    results.messages.length > 0
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => { if (!v) { toggleCommandPalette(); setQuery(''); setResults(null); } }}
    >
      <div className="flex items-center border-b px-3">
        {loading
          ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          : <Search  className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
        <CommandInput
          placeholder="Search contacts, conversations, messages… (⌘K)"
          value={query}
          onValueChange={setQuery}
          className="border-0 focus:ring-0 shadow-none"
        />
      </div>
      <CommandList>
        {query.length >= 2 && (
          <>
            {!loading && !hasResults && (
              <CommandEmpty>No results for &quot;{query}&quot;</CommandEmpty>
            )}

            {results?.contacts && results.contacts.length > 0 && (
              <CommandGroup heading="Contacts">
                {results.contacts.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`contact-${c.id}-${c.name ?? c.phone}`}
                    onSelect={() => runCommand(() => router.push('/contacts'))}
                    className="gap-2 cursor-pointer"
                  >
                    <div className="h-6 w-6 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold text-brand-700">
                        {(c.name ?? c.phone).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                    </div>
                    {c.tags && c.tags.length > 0 && (
                      <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{c.tags[0]}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results?.conversations && results.conversations.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Conversations">
                  {results.conversations.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`conv-${c.id}`}
                      onSelect={() => runCommand(() => router.push(`/conversations/${c.id}`))}
                      className="gap-2 cursor-pointer"
                    >
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.contacts?.name ?? 'Unknown'}</p>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground font-mono">{c.contacts?.phone}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] rounded-full px-1.5 py-0.5 capitalize font-medium ${
                        c.status === 'open'     ? 'bg-emerald-100 text-emerald-700' :
                        c.status === 'resolved' ? 'bg-gray-100 text-gray-600'      :
                                                  'bg-amber-100 text-amber-700'
                      }`}>{c.status}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results?.messages && results.messages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Messages">
                  {results.messages.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`msg-${m.id}`}
                      onSelect={() => runCommand(() => router.push(`/conversations/${m.conversation_id}`))}
                      className="gap-2 cursor-pointer"
                    >
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{m.content}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(m.created_at), 'MMM d, HH:mm')} · {m.direction}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
          </>
        )}

        <CommandGroup heading={query.length >= 2 ? 'Pages' : 'Navigate'}>
          {PAGES.map(({ href, icon: Icon, label }) => (
            <CommandItem
              key={href}
              value={label}
              onSelect={() => runCommand(() => router.push(href))}
              className="gap-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

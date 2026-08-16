'use client';

// Platform-admin "Client Inboxes" — the owner picks any client workspace, browses
// its conversations, opens a thread, and can reply (sending on that client's own
// WhatsApp/Instagram number). Orchestrates three panes:
//   • workspace picker (top)   — drives selected workspaceId
//   • ConversationList (left)  — /api/admin/conversations?workspaceId=…
//   • ThreadView (right)       — messages + reply composer with safety banner
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Users, ChevronDown } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { WorkspaceRow } from '@/app/api/admin/workspaces/route';
import { ConversationList } from './ConversationList';
import { ThreadView } from './ThreadView';
import type { AdminConversation } from './types';

const PAGE_SIZE = 30;

interface ConversationsResponse {
  conversations: AdminConversation[];
  total: number;
}

export function ClientInboxes() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('all');

  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<AdminConversation | null>(null);

  // Guards against out-of-order responses clobbering the list (fast filter changes).
  const requestRef = useRef(0);

  // ── Workspaces for the picker ───────────────────────────────────────────────
  const { data: wsData, isLoading: wsLoading } = useQuery<{ workspaces: WorkspaceRow[] }>({
    queryKey: ['admin-workspaces'],
    queryFn: () => fetch('/api/admin/workspaces').then((r) => r.json()),
  });
  const workspaces = useMemo(() => wsData?.workspaces ?? [], [wsData]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );

  // ── Debounce the search box ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Build the query string for a given offset.
  const buildUrl = (off: number) => {
    const p = new URLSearchParams({ workspaceId: workspaceId ?? '', limit: String(PAGE_SIZE), offset: String(off) });
    if (status !== 'all') p.set('status', status);
    if (debouncedSearch) p.set('q', debouncedSearch);
    return `/api/admin/conversations?${p.toString()}`;
  };

  // ── (Re)load first page whenever workspace / filters change ─────────────────
  useEffect(() => {
    if (!workspaceId) {
      setConversations([]);
      setTotal(0);
      setOffset(0);
      setSelected(null);
      return;
    }
    const reqId = ++requestRef.current;
    setListLoading(true);
    setSelected(null);
    fetch(buildUrl(0))
      .then((r) => r.json())
      .then((data: ConversationsResponse) => {
        if (reqId !== requestRef.current) return; // stale
        setConversations(data.conversations ?? []);
        setTotal(data.total ?? 0);
        setOffset((data.conversations ?? []).length);
      })
      .catch(() => {
        if (reqId !== requestRef.current) return;
        setConversations([]);
        setTotal(0);
      })
      .finally(() => {
        if (reqId === requestRef.current) setListLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, status, debouncedSearch]);

  const handleLoadMore = () => {
    if (!workspaceId || loadingMore) return;
    const reqId = requestRef.current; // keep the current generation
    setLoadingMore(true);
    fetch(buildUrl(offset))
      .then((r) => r.json())
      .then((data: ConversationsResponse) => {
        if (reqId !== requestRef.current) return;
        const next = data.conversations ?? [];
        setConversations((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...next.filter((c) => !seen.has(c.id))];
        });
        setTotal(data.total ?? 0);
        setOffset((o) => o + next.length);
      })
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col space-y-4">
      {/* Header + workspace picker */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Inboxes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            View and reply to any client’s conversations — replies send on the client’s own number.
          </p>
        </div>
        <div className="w-72">
          <label className="mb-1 block text-xs font-medium text-gray-500">Client workspace</label>
          {wsLoading ? (
            <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clients…
            </div>
          ) : (
            <Select value={workspaceId ?? ''} onValueChange={(v) => setWorkspaceId(v)}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{w.name}</span>
                      <span className="text-xs text-gray-400">
                        ({w.conversations_count?.toLocaleString('en-IN') ?? 0})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Two-pane inbox */}
      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {!workspaceId ? (
          <div className="col-span-2 flex flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50">
              <Users className="h-6 w-6 text-orange-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">Select a client to begin</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
              Use the picker above <ChevronDown className="h-3 w-3" />
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-0 border-r border-gray-100">
              <ConversationList
                conversations={conversations}
                total={total}
                loading={listLoading}
                loadingMore={loadingMore}
                selectedId={selected?.id ?? null}
                search={search}
                status={status}
                onSearchChange={setSearch}
                onStatusChange={setStatus}
                onSelect={setSelected}
                onLoadMore={handleLoadMore}
              />
            </div>
            <div className="min-h-0">
              <ThreadView
                conversation={selected}
                workspaceName={selectedWorkspace?.name ?? 'this client'}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

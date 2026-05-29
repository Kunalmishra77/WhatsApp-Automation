# Agentix Phase 5 — Conversations Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three-panel real-time chat inbox — ConversationList (left), ChatWindow (center), CustomerPanel (right) — wired to Supabase with live message streaming.

**Architecture:** Service layer (`modules/conversations/services/`) handles all Supabase queries. TanStack Query hooks (`modules/conversations/hooks/`) manage cache + realtime invalidation via `useRealtime`. The page (`app/(dashboard)/conversations/page.tsx`) composes the three panels; on mobile, selecting a conversation navigates to `[id]/page.tsx`. The global `useConversationStore` (already exists at `store/conversation.store.ts`) tracks `activeConversationId`.

**Tech Stack:** Next.js 15 App Router, Supabase browser client (`@/services/supabase/client`), TanStack Query v5, `@tanstack/react-virtual`, `useRealtime` hook (`@/hooks/useRealtime`), Zustand (`useConversationStore`, `useWorkspaceStore`, `useAuthStore`), shadcn/ui (Avatar, Badge, ScrollArea, Textarea, Separator, Skeleton, Sheet), lucide-react, date-fns, Framer Motion.

---

## File Map

### New files
```
modules/conversations/services/conversation.service.ts   — Supabase CRUD for conversations
modules/conversations/services/message.service.ts        — Supabase CRUD for messages
modules/conversations/hooks/useConversations.ts          — TanStack Query list + realtime
modules/conversations/hooks/useMessages.ts               — infinite scroll messages + realtime
modules/conversations/components/ConversationList/index.tsx   — virtualized left panel
modules/conversations/components/ConversationItem/index.tsx   — single conversation row
modules/conversations/components/ConversationHeader/index.tsx — top bar of chat window
modules/conversations/components/ChatWindow/index.tsx         — message feed + input
modules/conversations/components/MessageBubble/index.tsx      — inbound/outbound bubble
modules/conversations/components/TypingIndicator/index.tsx    — animated dots
modules/conversations/components/MessageInput/index.tsx       — textarea with send button
modules/conversations/components/CustomerPanel/index.tsx      — right panel contact detail
modules/conversations/components/ConversationsSkeleton/index.tsx — loading skeleton
```

### Modified files
```
app/(dashboard)/conversations/page.tsx      — three-panel layout
app/(dashboard)/conversations/[id]/page.tsx — mobile deep-link (create this file)
```

---

## Task 1: Conversation Service

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\services\conversation.service.ts`

- [ ] **Step 1: Write conversation service**

Write `d:\WhatsApp-Automation\modules\conversations\services\conversation.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type ConversationRow = Database['public']['Tables']['conversations']['Row'];
export type ConversationWithContact = ConversationRow & {
  contacts: {
    id: string;
    name: string | null;
    phone: string;
    avatar_url: string | null;
  };
};

export async function fetchConversations(
  workspaceId: string,
  status?: string,
): Promise<ConversationWithContact[]> {
  const supabase = createClient();
  let query = supabase
    .from('conversations')
    .select(`*, contacts(id, name, phone, avatar_url)`)
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ConversationWithContact[];
}

export async function fetchConversation(id: string): Promise<ConversationWithContact | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select(`*, contacts(id, name, phone, avatar_url)`)
    .eq('id', id)
    .single();
  if (error) return null;
  return data as ConversationWithContact;
}

export async function updateConversationStatus(
  id: string,
  status: Database['public']['Tables']['conversations']['Row']['status'],
) {
  const supabase = createClient();
  const { error } = await supabase
    .from('conversations')
    .update({ status, ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}) })
    .eq('id', id);
  if (error) throw error;
}

export async function assignConversation(id: string, agentId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('conversations')
    .update({ assigned_agent_id: agentId, status: 'assigned' })
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/services/conversation.service.ts
git commit -m "feat(conversations): add conversation service (fetch, status update, assign)"
```

---

## Task 2: Message Service

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\services\message.service.ts`

- [ ] **Step 1: Write message service**

Write `d:\WhatsApp-Automation\modules\conversations\services\message.service.ts`:

```typescript
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type MessageRow = Database['public']['Tables']['messages']['Row'];

const PAGE_SIZE = 50;

export async function fetchMessages(
  conversationId: string,
  page = 0,
): Promise<MessageRow[]> {
  const supabase = createClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return (data ?? []).reverse();
}

export async function sendMessage(payload: {
  conversationId: string;
  workspaceId: string;
  senderId: string;
  content: string;
  type?: Database['public']['Tables']['messages']['Row']['type'];
  replyToId?: string;
}): Promise<MessageRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: payload.conversationId,
      workspace_id: payload.workspaceId,
      sender_id: payload.senderId,
      sender_type: 'agent',
      direction: 'outbound',
      type: payload.type ?? 'text',
      content: payload.content,
      reply_to_id: payload.replyToId ?? null,
      status: 'queued',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function sendInternalNote(payload: {
  conversationId: string;
  workspaceId: string;
  senderId: string;
  content: string;
}): Promise<MessageRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: payload.conversationId,
      workspace_id: payload.workspaceId,
      sender_id: payload.senderId,
      sender_type: 'agent',
      direction: 'outbound',
      type: 'internal_note',
      content: payload.content,
      status: 'sent',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/services/message.service.ts
git commit -m "feat(conversations): add message service (fetch paginated, send, internal note)"
```

---

## Task 3: useConversations Hook

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\hooks\useConversations.ts`

- [ ] **Step 1: Write hook**

Write `d:\WhatsApp-Automation\modules\conversations\hooks\useConversations.ts`:

```typescript
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { fetchConversations } from '../services/conversation.service';
import type { ConversationWithContact } from '../services/conversation.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useConversations(status = 'all') {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const queryClient = useQueryClient();

  const query = useQuery<ConversationWithContact[]>({
    queryKey: ['conversations', workspaceId, status],
    queryFn: () => fetchConversations(workspaceId!, status),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // Realtime: invalidate on any change to conversations in this workspace
  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`conversations-list:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, queryClient]);

  return query;
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/hooks/useConversations.ts
git commit -m "feat(conversations): add useConversations hook with realtime invalidation"
```

---

## Task 4: useMessages Hook

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\hooks\useMessages.ts`

- [ ] **Step 1: Write hook**

Write `d:\WhatsApp-Automation\modules\conversations\hooks\useMessages.ts`:

```typescript
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { fetchMessages, sendMessage, sendInternalNote } from '../services/message.service';
import type { MessageRow } from '../services/message.service';
import { useConversationStore } from '@/store/conversation.store';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useMessages(conversationId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<MessageRow[]>({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId),
    enabled: !!conversationId,
    staleTime: 0,
  });

  // Realtime: append new messages live
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          queryClient.setQueryData<MessageRow[]>(
            ['messages', conversationId],
            (old = []) => {
              if (old.some((m) => m.id === newMsg.id)) return old;
              return [...old, newMsg];
            },
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  return async (conversationId: string, content: string, isNote = false) => {
    if (!user || !workspaceId) return;

    // Optimistic insert
    const optimistic: MessageRow = {
      id: `opt-${Date.now()}`,
      conversation_id: conversationId,
      workspace_id: workspaceId,
      sender_type: 'agent',
      sender_id: user.id,
      direction: 'outbound',
      type: isNote ? 'internal_note' : 'text',
      content,
      status: 'queued',
      is_deleted: false,
      reply_to_id: null,
      media_url: null,
      media_mime_type: null,
      media_size: null,
      media_filename: null,
      caption: null,
      whatsapp_msg_id: null,
      reactions: {},
      metadata: {},
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    queryClient.setQueryData<MessageRow[]>(
      ['messages', conversationId],
      (old = []) => [...old, optimistic],
    );

    try {
      const fn = isNote ? sendInternalNote : sendMessage;
      await fn({ conversationId, workspaceId, senderId: user.id, content });
    } catch {
      // Roll back optimistic update on error
      queryClient.setQueryData<MessageRow[]>(
        ['messages', conversationId],
        (old = []) => old.filter((m) => m.id !== optimistic.id),
      );
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    }
  };
}

export function useTypingBroadcast(conversationId: string) {
  const setTyping = useConversationStore((s) => s.setTyping);
  const user = useAuthStore((s) => s.user);

  // Subscribe to typing broadcast events
  useEffect(() => {
    if (!conversationId || !user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user_id, is_typing } = payload.payload as { user_id: string; is_typing: boolean };
        if (user_id !== user.id) {
          setTyping(user_id, conversationId, is_typing);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user, setTyping]);

  const broadcastTyping = async (isTyping: boolean) => {
    if (!user) return;
    const supabase = createClient();
    await supabase.channel(`typing:${conversationId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id, is_typing: isTyping },
    });
  };

  return { broadcastTyping };
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/hooks/useMessages.ts
git commit -m "feat(conversations): add useMessages hook (realtime append, optimistic send, typing broadcast)"
```

---

## Task 5: ConversationItem Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\components\ConversationItem\index.tsx`

- [ ] **Step 1: Write ConversationItem**

Write `d:\WhatsApp-Automation\modules\conversations\components\ConversationItem\index.tsx`:

```typescript
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import type { ConversationWithContact } from '../../services/conversation.service';

interface ConversationItemProps {
  conversation: ConversationWithContact;
  isActive: boolean;
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  open:     'bg-emerald-500',
  assigned: 'bg-brand-500',
  pending:  'bg-amber-500',
  snoozed:  'bg-gray-400',
  resolved: 'bg-gray-300',
};

export function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const contact = conversation.contacts;
  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNowStrict(new Date(conversation.last_message_at), { addSuffix: false })
    : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent',
        isActive && 'bg-brand-500/10 border-r-2 border-brand-500',
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarImage src={contact?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
            STATUS_COLORS[conversation.status] ?? 'bg-gray-300',
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground mt-0.5">
          {conversation.last_message ?? 'No messages yet'}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          {conversation.unread_count > 0 && (
            <Badge className="h-4 min-w-4 rounded-full bg-brand-500 px-1 text-[10px] text-white">
              {conversation.unread_count}
            </Badge>
          )}
          {conversation.labels.slice(0, 2).map((label) => (
            <Badge key={label} variant="outline" className="h-4 px-1.5 text-[10px]">
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/components/ConversationItem/
git commit -m "feat(conversations): add ConversationItem with status dot, unread badge, labels"
```

---

## Task 6: ConversationList Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\components\ConversationList\index.tsx`

- [ ] **Step 1: Write ConversationList**

Write `d:\WhatsApp-Automation\modules\conversations\components\ConversationList\index.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search } from 'lucide-react';
import { ConversationItem } from '../ConversationItem';
import { useConversations } from '../../hooks/useConversations';
import { useConversationStore } from '@/store/conversation.store';
import type { ConversationWithContact } from '../../services/conversation.service';

const STATUS_TABS = ['all', 'open', 'assigned', 'pending', 'resolved'] as const;

export function ConversationList() {
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const activeId = useConversationStore((s) => s.activeConversationId);
  const setActive = useConversationStore((s) => s.setActiveConversation);

  const { data: conversations = [], isLoading } = useConversations(status);

  const filtered = search.trim()
    ? conversations.filter((c) => {
        const contact = c.contacts;
        const name = (contact?.name ?? '').toLowerCase();
        const phone = (contact?.phone ?? '').toLowerCase();
        const msg = (c.last_message ?? '').toLowerCase();
        const q = search.toLowerCase();
        return name.includes(q) || phone.includes(q) || msg.includes(q);
      })
    : conversations;

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 5,
  });

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground mb-2">Conversations</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="shrink-0 border-b border-border px-2 py-1">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="h-7 w-full gap-0 bg-transparent p-0">
            {STATUS_TABS.map((s) => (
              <TabsTrigger
                key={s}
                value={s}
                className="h-7 flex-1 rounded-md px-1 text-[11px] capitalize data-[state=active]:bg-accent data-[state=active]:shadow-none"
              >
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex-1 space-y-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No conversations found.</p>
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const conv = filtered[row.index] as ConversationWithContact;
              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  <ConversationItem
                    conversation={conv}
                    isActive={conv.id === activeId}
                    onClick={() => setActive(conv.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/components/ConversationList/
git commit -m "feat(conversations): add virtualized ConversationList with search and status tabs"
```

---

## Task 7: MessageBubble + TypingIndicator

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\components\MessageBubble\index.tsx`
- Create: `d:\WhatsApp-Automation\modules\conversations\components\TypingIndicator\index.tsx`

- [ ] **Step 1: Write MessageBubble**

Write `d:\WhatsApp-Automation\modules\conversations\components\MessageBubble\index.tsx`:

```typescript
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock } from 'lucide-react';
import type { MessageRow } from '../../services/message.service';

interface MessageBubbleProps {
  message: MessageRow;
}

const STATUS_ICON = {
  queued:    <Clock className="h-3 w-3" />,
  sent:      <Check className="h-3 w-3" />,
  delivered: <CheckCheck className="h-3 w-3" />,
  read:      <CheckCheck className="h-3 w-3 text-brand-400" />,
  failed:    <span className="text-[10px] text-destructive">!</span>,
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isNote = message.type === 'internal_note';
  const time = format(new Date(message.created_at), 'HH:mm');

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
          isOutbound && !isNote && 'rounded-br-sm bg-brand-500 text-white',
          !isOutbound && 'rounded-bl-sm bg-card text-foreground border border-border',
          isNote && 'rounded-br-sm bg-amber-50 border border-amber-200 text-amber-900',
        )}
      >
        {isNote && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Internal Note
          </p>
        )}
        {message.content && (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1',
            isOutbound && !isNote ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          <span className="text-[10px]">{time}</span>
          {isOutbound && !isNote && STATUS_ICON[message.status]}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write TypingIndicator**

Write `d:\WhatsApp-Automation\modules\conversations\components\TypingIndicator\index.tsx`:

```typescript
export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-3 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.9s' }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/components/MessageBubble/ modules/conversations/components/TypingIndicator/
git commit -m "feat(conversations): add MessageBubble (inbound/outbound/note) and TypingIndicator"
```

---

## Task 8: MessageInput Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\components\MessageInput\index.tsx`

- [ ] **Step 1: Write MessageInput**

Write `d:\WhatsApp-Automation\modules\conversations\components\MessageInput\index.tsx`:

```typescript
'use client';

import { useState, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSendMessage, useTypingBroadcast } from '../../hooks/useMessages';
import { useDebounce } from '@/hooks/useDebounce';

interface MessageInputProps {
  conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [text, setText] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendMessage = useSendMessage();
  const { broadcastTyping } = useTypingBroadcast(conversationId);
  const isTypingRef = useRef(false);

  const stopTyping = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      void broadcastTyping(false);
    }
  }, [broadcastTyping]);

  const debouncedStopTyping = useDebounce(stopTyping, 2000);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      void broadcastTyping(true);
    }
    debouncedStopTyping();
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    stopTyping();
    await sendMessage(conversationId, trimmed, isNote);
    setText('');
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          'shrink-0 border-t border-border bg-card px-4 py-3',
          isNote && 'bg-amber-50/50 border-amber-200',
        )}
      >
        {isNote && (
          <p className="mb-2 text-xs font-medium text-amber-700">
            Internal note — not sent to customer
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isNote ? 'Add an internal note…' : 'Type a message… (Enter to send)'}
            className={cn(
              'min-h-[40px] max-h-32 flex-1 resize-none text-sm',
              isNote && 'border-amber-200 focus-visible:ring-amber-400',
            )}
            rows={1}
          />
          <div className="flex items-center gap-1.5 pb-0.5">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-8 w-8', isNote && 'text-amber-600')}
                  onClick={() => setIsNote((n) => !n)}
                >
                  <StickyNote className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Toggle internal note</TooltipContent>
            </Tooltip>

            <Button
              size="icon"
              className="h-8 w-8 bg-brand-500 hover:bg-brand-600"
              onClick={() => void handleSend()}
              disabled={!text.trim() || isSending}
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
```

Note: `useDebounce` already exists at `hooks/useDebounce.ts` — check it returns a stable debounced function. If it returns a debounced value (not a function), replace `debouncedStopTyping` with a `useRef`-based debounce:

```typescript
const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout>>();
const scheduleStopTyping = () => {
  clearTimeout(stopTypingTimerRef.current);
  stopTypingTimerRef.current = setTimeout(stopTyping, 2000);
};
```

And call `scheduleStopTyping()` in `handleChange` instead of `debouncedStopTyping()`.

- [ ] **Step 2: Check useDebounce signature**

```powershell
Get-Content "d:\WhatsApp-Automation\hooks\useDebounce.ts"
```

Adjust MessageInput as noted above if useDebounce returns a value rather than a function.

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/components/MessageInput/
git commit -m "feat(conversations): add MessageInput with send, internal note toggle, typing broadcast"
```

---

## Task 9: ConversationHeader Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\components\ConversationHeader\index.tsx`

- [ ] **Step 1: Write ConversationHeader**

Write `d:\WhatsApp-Automation\modules\conversations\components\ConversationHeader\index.tsx`:

```typescript
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCircle2, MoreVertical, PhoneCall, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateConversationStatus } from '../../services/conversation.service';
import { useQueryClient } from '@tanstack/react-query';
import type { ConversationWithContact } from '../../services/conversation.service';

interface ConversationHeaderProps {
  conversation: ConversationWithContact;
}

const STATUS_BADGE: Record<string, string> = {
  open:     'bg-emerald-100 text-emerald-700',
  assigned: 'bg-brand-100 text-brand-700',
  pending:  'bg-amber-100 text-amber-700',
  resolved: 'bg-gray-100 text-gray-600',
  snoozed:  'bg-gray-100 text-gray-500',
};

export function ConversationHeader({ conversation }: ConversationHeaderProps) {
  const queryClient = useQueryClient();
  const contact = conversation.contacts;
  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();

  const resolve = async () => {
    await updateConversationStatus(conversation.id, 'resolved');
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    void queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
  };

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={contact?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">{name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{contact?.phone}</p>
        </div>
        <span
          className={cn(
            'ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
            STATUS_BADGE[conversation.status] ?? 'bg-gray-100 text-gray-500',
          )}
        >
          {conversation.status}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {conversation.status !== 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void resolve()}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Resolve
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2">
              <User className="h-4 w-4" /> View Contact
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <PhoneCall className="h-4 w-4" /> Call
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/components/ConversationHeader/
git commit -m "feat(conversations): add ConversationHeader with status badge and resolve action"
```

---

## Task 10: ChatWindow Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\components\ChatWindow\index.tsx`

- [ ] **Step 1: Write ChatWindow**

Write `d:\WhatsApp-Automation\modules\conversations\components\ChatWindow\index.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageBubble } from '../MessageBubble';
import { TypingIndicator } from '../TypingIndicator';
import { MessageInput } from '../MessageInput';
import { ConversationHeader } from '../ConversationHeader';
import { useMessages } from '../../hooks/useMessages';
import { useQuery } from '@tanstack/react-query';
import { fetchConversation } from '../../services/conversation.service';
import { useConversationStore } from '@/store/conversation.store';

interface ChatWindowProps {
  conversationId: string;
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingUsers = useConversationStore((s) =>
    s.typingUsers.filter((t) => t.conversation_id === conversationId),
  );

  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
    enabled: !!conversationId,
  });

  const { data: messages = [], isLoading } = useMessages(conversationId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!conversation) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ConversationHeader conversation={conversation} />

      {/* Message feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
              >
                <Skeleton className="h-12 w-52 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {typingUsers.length > 0 && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <MessageInput conversationId={conversationId} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/components/ChatWindow/
git commit -m "feat(conversations): add ChatWindow (auto-scroll, messages feed, typing indicator)"
```

---

## Task 11: CustomerPanel Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\conversations\components\CustomerPanel\index.tsx`

- [ ] **Step 1: Write CustomerPanel**

Write `d:\WhatsApp-Automation\modules\conversations\components\CustomerPanel\index.tsx`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Mail, Building2, Tag, Globe } from 'lucide-react';
import { fetchConversation } from '../../services/conversation.service';
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

type ContactRow = Database['public']['Tables']['contacts']['Row'];

interface CustomerPanelProps {
  conversationId: string;
}

async function fetchContactForConversation(conversationId: string): Promise<ContactRow | null> {
  const supabase = createClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('id', conversationId)
    .single();
  if (!conv) return null;

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', conv.contact_id)
    .single();
  return contact;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function CustomerPanel({ conversationId }: CustomerPanelProps) {
  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact-for-conv', conversationId],
    queryFn: () => fetchContactForConversation(conversationId),
    enabled: !!conversationId,
  });

  if (isLoading) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-card p-4 space-y-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Profile */}
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            <Avatar className="h-14 w-14">
              <AvatarImage src={contact?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-brand-100 text-brand-700 text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">{contact?.phone}</p>
            </div>
          </div>

          <Separator />

          {/* Contact info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact Info
            </p>
            <InfoRow icon={Phone} label="Phone" value={contact?.phone ?? null} />
            <InfoRow icon={Mail} label="Email" value={contact?.email ?? null} />
            <InfoRow icon={Building2} label="Company" value={contact?.company ?? null} />
            <InfoRow icon={Globe} label="Country" value={contact?.country ?? null} />
          </div>

          {contact?.tags && contact.tags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[11px] gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {contact?.is_blocked && (
            <Badge variant="destructive" className="w-full justify-center">
              Blocked
            </Badge>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/conversations/components/CustomerPanel/
git commit -m "feat(conversations): add CustomerPanel with contact profile, info, and tags"
```

---

## Task 12: Wire Conversations Page

**Files:**
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\conversations\page.tsx`
- Create: `d:\WhatsApp-Automation\app\(dashboard)\conversations\[id]\page.tsx`

- [ ] **Step 1: Write conversations page**

Write `d:\WhatsApp-Automation\app\(dashboard)\conversations\page.tsx`:

```typescript
'use client';

import { ConversationList } from '@/modules/conversations/components/ConversationList';
import { ChatWindow } from '@/modules/conversations/components/ChatWindow';
import { CustomerPanel } from '@/modules/conversations/components/CustomerPanel';
import { useConversationStore } from '@/store/conversation.store';
import { MessageSquare } from 'lucide-react';

export default function ConversationsPage() {
  const activeId = useConversationStore((s) => s.activeConversationId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: conversation list */}
      <ConversationList />

      {/* Center: chat window or empty state */}
      {activeId ? (
        <ChatWindow conversationId={activeId} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10">
            <MessageSquare className="h-7 w-7 text-brand-500" />
          </div>
          <p className="text-base font-medium text-foreground">Select a conversation</p>
          <p className="text-sm text-muted-foreground">
            Choose from the list to start chatting.
          </p>
        </div>
      )}

      {/* Right: customer panel */}
      {activeId && (
        <div className="hidden xl:flex">
          <CustomerPanel conversationId={activeId} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write [id] page for mobile deep-link**

Write `d:\WhatsApp-Automation\app\(dashboard)\conversations\[id]\page.tsx`:

```typescript
'use client';

import { use, useEffect } from 'react';
import { useConversationStore } from '@/store/conversation.store';
import { ChatWindow } from '@/modules/conversations/components/ChatWindow';

export default function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const setActive = useConversationStore((s) => s.setActiveConversation);

  useEffect(() => {
    setActive(id);
    return () => setActive(null);
  }, [id, setActive]);

  return <ChatWindow conversationId={id} />;
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add "app/(dashboard)/conversations/"
git commit -m "feat(conversations): wire three-panel conversations page and mobile [id] route"
```

---

## Task 13: Build Verification

- [ ] **Step 1: TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: Zero errors.

- [ ] **Step 2: Production build**

```powershell
cd "d:\WhatsApp-Automation"; npm run build 2>&1 | Select-Object -Last 20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Final commit**

```powershell
cd "d:\WhatsApp-Automation"
git add -A
git commit -m "feat: Phase 5 complete — Conversations module (three-panel chat, realtime, typing)"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| Three-panel layout: List / Chat / Contact | ✅ | Task 12 |
| Virtualized conversation list | ✅ | Task 6 |
| Search + status tab filters | ✅ | Task 6 |
| Realtime new message streaming | ✅ | Task 4 |
| Optimistic message send | ✅ | Task 4 |
| Inbound/outbound message bubbles | ✅ | Task 7 |
| Internal notes (amber style) | ✅ | Tasks 7, 8 |
| Typing indicator (broadcast + UI) | ✅ | Tasks 4, 7 |
| Resolve conversation action | ✅ | Task 9 |
| Customer panel with contact details | ✅ | Task 11 |
| Mobile deep-link route `/conversations/[id]` | ✅ | Task 12 |
| Message status icons (queued/sent/delivered/read) | ✅ | Task 7 |

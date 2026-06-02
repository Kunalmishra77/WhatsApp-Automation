'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Phone, Mail, Tag, Globe, MessageSquare, ShoppingBag, Star, CheckCircle2, Clock, StickyNote, Layers, Plus, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { createClient } from '@/services/supabase/client';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CustomerPanelProps { conversationId: string; }

async function fetchContactId(conversationId: string): Promise<string | null> {
  const supabase = createClient() as any;
  const { data } = await supabase.from('conversations').select('contact_id').eq('id', conversationId).single();
  return data?.contact_id ?? null;
}

async function fetch360(contactId: string, workspaceId: string) {
  const res = await fetch(`/api/contacts/${contactId}/360?workspaceId=${workspaceId}`);
  if (!res.ok) return null;
  return res.json();
}

const STATUS_COLOR: Record<string, string> = {
  open:     'bg-green-100 text-green-700',
  pending:  'bg-amber-100 text-amber-700',
  resolved: 'bg-gray-100 text-gray-600',
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  delivered:        'bg-green-100 text-green-700',
  shipped:          'bg-blue-100 text-blue-700',
  out_for_delivery: 'bg-blue-100 text-blue-700',
  pending:          'bg-amber-100 text-amber-700',
  cancelled:        'bg-red-100 text-red-700',
};

export function CustomerPanel({ conversationId }: CustomerPanelProps) {
  const workspaceId  = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient  = useQueryClient();
  const [noteText, setNoteText] = useState('');

  const { data: contactId } = useQuery({
    queryKey: ['conv-contact', conversationId],
    queryFn:  () => fetchContactId(conversationId),
    enabled:  !!conversationId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['customer-360', contactId, workspaceId],
    queryFn:  () => fetch360(contactId!, workspaceId),
    enabled:  !!contactId && !!workspaceId,
  });

  const addNote = useMutation({
    mutationFn: () =>
      fetch(`/api/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, content: noteText.trim() }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer-360', contactId, workspaceId] });
      setNoteText('');
      toast.success('Note saved');
    },
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) =>
      fetch(`/api/contacts/${contactId}/notes?noteId=${noteId}&workspaceId=${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer-360', contactId, workspaceId] });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="w-72 shrink-0 border-l border-border bg-card p-4 space-y-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  const { contact, stats, conversations, orders, csatResponses, notes = [], customFieldDefs = [] } = data as {
    contact: Record<string, unknown>;
    stats: { totalConversations: number; resolvedConversations: number; avgCsat: number | null; totalOrders: number; totalSpent: number };
    conversations: Array<Record<string, unknown>>;
    orders: Array<Record<string, unknown>>;
    csatResponses: Array<Record<string, unknown>>;
    notes: Array<Record<string, unknown>>;
    customFieldDefs: Array<{ id: string; name: string; label: string; field_type: string; options: string[] | null }>;
  };

  const name     = (contact.name as string | null) ?? (contact.phone as string);
  const initials = name.slice(0, 2).toUpperCase();
  const tags     = (contact.tags as string[] | null) ?? [];
  const customFields = (contact.custom_fields as Record<string, unknown> | null) ?? {};

  return (
    <ScrollArea className="w-72 shrink-0 border-l border-border bg-card">
      <div className="p-4 space-y-4">
        {/* Contact header */}
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-brand-100 text-brand-700 text-sm font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{name}</p>
            {!!contact.phone && <p className="text-xs text-muted-foreground">{String(contact.phone)}</p>}
            {!!contact.opted_out && <Badge variant="outline" className="mt-1 text-[10px] text-red-600 border-red-200">Opted Out</Badge>}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Chats',    value: stats.totalConversations },
            { label: 'Resolved', value: stats.resolvedConversations },
            { label: 'CSAT',     value: stats.avgCsat != null ? `${stats.avgCsat}/5 ⭐` : '—' },
            { label: 'Revenue',  value: stats.totalSpent > 0 ? `₹${stats.totalSpent.toLocaleString()}` : '—' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border p-2 text-center">
              <p className="text-sm font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Contact details */}
        <div className="space-y-1.5">
          {!!contact.email && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{String(contact.email)}</span>
            </div>
          )}
          {!!contact.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" /><span>{String(contact.phone)}</span>
            </div>
          )}
          {!!contact.language && contact.language !== 'en' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" /><span>Speaks {String(contact.language).toUpperCase()}</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex items-start gap-2">
              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{t}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Since {format(new Date(contact.created_at as string), 'MMM d, yyyy')}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="conversations" className="w-full">
          <TabsList className="w-full h-7 grid grid-cols-5">
            <TabsTrigger value="conversations" className="text-[10px] px-1">
              <MessageSquare className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="orders" className="text-[10px] px-1">
              <ShoppingBag className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="csat" className="text-[10px] px-1">
              <Star className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-[10px] px-1">
              <StickyNote className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="fields" className="text-[10px] px-1">
              <Layers className="h-3 w-3" />
            </TabsTrigger>
          </TabsList>

          {/* Chats */}
          <TabsContent value="conversations" className="mt-2 space-y-1.5">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No conversations</p>
            ) : (
              (conversations as Array<Record<string, unknown>>).slice(0, 10).map((c) => (
                <div key={c.id as string} className="rounded-lg border border-border p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_COLOR[c.status as string] ?? 'bg-gray-100 text-gray-600')}>
                      {c.status as string}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at as string), { addSuffix: true })}
                    </span>
                  </div>
                  {!!c.last_message && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{String(c.last_message)}</p>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          {/* Orders */}
          <TabsContent value="orders" className="mt-2 space-y-1.5">
            {orders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No orders</p>
            ) : (
              (orders as Array<Record<string, unknown>>).map((o) => (
                <div key={o.id as string} className="rounded-lg border border-border p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">#{o.order_ref as string}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ORDER_STATUS_COLOR[o.status as string] ?? 'bg-gray-100 text-gray-600')}>
                      {(o.status as string).replace(/_/g, ' ')}
                    </span>
                  </div>
                  {!!o.total_amount && (
                    <p className="text-[11px] text-muted-foreground">
                      {String(o.currency)} {(o.total_amount as number).toLocaleString()}
                    </p>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          {/* CSAT */}
          <TabsContent value="csat" className="mt-2 space-y-1.5">
            {csatResponses.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No ratings yet</p>
            ) : (
              (csatResponses as Array<Record<string, unknown>>).map((r, i) => (
                <div key={i} className="rounded-lg border border-border p-2 flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: r.score as number }).map((_, j) => (
                      <Star key={j} className="h-3 w-3 fill-amber-400 text-amber-400" />
                    ))}
                    {Array.from({ length: 5 - (r.score as number) }).map((_, j) => (
                      <Star key={j} className="h-3 w-3 text-muted-foreground/30" />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(r.responded_at as string), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-2 space-y-2">
            <div className="space-y-1.5">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this contact…"
                className="text-xs resize-none h-16"
              />
              <Button
                size="sm"
                className="h-7 w-full gap-1.5 text-xs"
                disabled={!noteText.trim() || addNote.isPending}
                onClick={() => void addNote.mutate()}
              >
                <Plus className="h-3 w-3" /> Add Note
              </Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No notes yet</p>
            ) : (
              notes.map((n) => (
                <div key={n.id as string} className="rounded-lg border border-border bg-amber-50/50 p-2.5 space-y-1.5">
                  <p className="text-xs text-foreground whitespace-pre-wrap">{String(n.content)}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at as string), { addSuffix: true })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-destructive"
                      onClick={() => void deleteNote.mutate(n.id as string)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Custom Fields */}
          <TabsContent value="fields" className="mt-2 space-y-1.5">
            {customFieldDefs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No custom fields defined.{' '}
                <span className="text-brand-600">Go to Settings → Custom Fields</span>
              </p>
            ) : (
              customFieldDefs.map((def) => {
                const val = customFields[def.name];
                return (
                  <div key={def.id} className="rounded-lg border border-border p-2 space-y-0.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{def.label}</p>
                    <p className="text-xs text-foreground">{val != null && String(val) !== '' ? String(val) : '—'}</p>
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}

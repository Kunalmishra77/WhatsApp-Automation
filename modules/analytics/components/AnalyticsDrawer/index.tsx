'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Search, ExternalLink, MessageSquare, Phone, Mail, Tag,
  Star, User, Clock, CheckCircle2, AlertTriangle, ArrowRight,
  Building2, Users,
} from 'lucide-react';
import { useAnalyticsDetail, type DrawerType } from '../../hooks/useAnalytics';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ConvRow {
  id: string; status: string; created_at: string; updated_at: string;
  resolved_at: string | null; unread_count: number;
  sla_first_breach: boolean; sla_resolve_breach: boolean;
  contacts: { id: string; name: string | null; phone: string; tags?: string[] } | null;
  profiles: { full_name: string; email: string } | null;
  lastMessage: string | null;
}
interface ContactRow {
  id: string; name: string | null; phone: string; email: string | null;
  tags: string[]; company: string | null; created_at: string;
  conversationCount: number;
}
interface CsatRow {
  id: string; score: number; comment: string | null; responded_at: string;
  contacts: { name: string | null; phone: string } | null;
  profiles: { full_name: string } | null;
}
interface MsgRow {
  id: string; content: string; type: string; status: string;
  created_at: string; sender_type: string; conversation_id: string;
  conversations: { contacts: { name: string | null; phone: string } | null } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  open:     'bg-emerald-100 text-emerald-700',
  resolved: 'bg-gray-100 text-gray-600',
  pending:  'bg-amber-100 text-amber-700',
  assigned: 'bg-brand-100 text-brand-700',
};
const MSG_TYPE_COLOR: Record<string, string> = {
  text: 'bg-blue-50 text-blue-600', image: 'bg-purple-50 text-purple-600',
  video: 'bg-pink-50 text-pink-600', audio: 'bg-green-50 text-green-600',
  document: 'bg-orange-50 text-orange-600', template: 'bg-indigo-50 text-indigo-600',
};

const DRAWER_TITLES: Record<DrawerType, string> = {
  open: 'Open Conversations', resolved: 'Resolved Conversations',
  pending: 'Pending Conversations', assigned: 'Assigned Conversations',
  'new-contacts': 'New Contacts', csat: 'CSAT Feedback Responses',
  inbound: 'Inbound Messages', outbound: 'Outbound Messages', delivery: 'Delivery Breakdown',
};

// ── Score distribution bar ─────────────────────────────────────────────────────
function ScoreBar({ score, count, total }: { score: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const colors = ['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-lime-400', 'bg-emerald-500'];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 text-muted-foreground font-medium">{score}★</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', colors[score - 1])} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-muted-foreground text-right">{count} ({pct}%)</span>
    </div>
  );
}

// ── Conversation card ──────────────────────────────────────────────────────────
function ConvCard({ row, onClick }: { row: ConvRow; onClick: () => void }) {
  const hasSLABreach = row.sla_first_breach || row.sla_resolve_breach;
  return (
    <div
      onClick={onClick}
      className="group flex flex-col gap-1.5 border-b border-border px-5 py-3.5 hover:bg-accent cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0 text-xs font-semibold text-brand-700">
            {(row.contacts?.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{row.contacts?.name ?? <span className="italic text-muted-foreground">Unknown</span>}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{row.contacts?.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasSLABreach && <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-label="SLA breach" />}
          {row.unread_count > 0 && (
            <span className="h-5 min-w-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{row.unread_count}</span>
          )}
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-600')}>{row.status}</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      {row.lastMessage && (
        <p className="text-xs text-muted-foreground line-clamp-1 pl-10">{row.lastMessage}</p>
      )}
      <div className="flex items-center gap-3 pl-10 text-[11px] text-muted-foreground">
        {row.profiles && <span className="flex items-center gap-1"><User className="h-3 w-3" />{row.profiles.full_name}</span>}
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })}</span>
        {row.contacts?.tags?.map((t) => (
          <span key={t} className="bg-muted rounded px-1">{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── Contact card ───────────────────────────────────────────────────────────────
function ContactCard({ row }: { row: ContactRow }) {
  return (
    <div className="border-b border-border px-5 py-3.5 hover:bg-accent transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0 text-sm font-semibold text-brand-700">
            {(row.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{row.name ?? <span className="italic text-muted-foreground">No name</span>}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone}</span>
              {row.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{row.email}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-medium text-brand-600">{row.conversationCount} conv{row.conversationCount !== 1 ? 's' : ''}</p>
          <p className="text-[10px] text-muted-foreground">{format(new Date(row.created_at), 'MMM d')}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 pl-11 flex-wrap">
        {row.company && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Building2 className="h-3 w-3" />{row.company}</span>}
        {row.tags?.map((t) => <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1.5">{t}</Badge>)}
      </div>
    </div>
  );
}

// ── CSAT card ──────────────────────────────────────────────────────────────────
function CsatCard({ row }: { row: CsatRow }) {
  const colors = ['text-red-500', 'text-orange-500', 'text-amber-500', 'text-lime-600', 'text-emerald-600'];
  return (
    <div className="border-b border-border px-5 py-3.5 hover:bg-accent transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <Star className={cn('h-4 w-4 fill-current', colors[row.score - 1])} />
          </div>
          <div>
            <p className="font-medium text-sm">{row.contacts?.name ?? row.contacts?.phone ?? '—'}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{row.contacts?.phone}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className={cn('text-2xl font-bold', colors[row.score - 1])}>{row.score}<span className="text-sm text-muted-foreground">/5</span></span>
          <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(row.responded_at), 'MMM d, HH:mm')}</p>
        </div>
      </div>
      {row.comment && <p className="mt-1.5 pl-10 text-xs text-muted-foreground italic">"{row.comment}"</p>}
      {row.profiles && <p className="mt-1 pl-10 text-[11px] text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />Agent: {row.profiles.full_name}</p>}
    </div>
  );
}

// ── Message card ───────────────────────────────────────────────────────────────
function MsgCard({ row, onClick }: { row: MsgRow; onClick: () => void }) {
  const contact = row.conversations?.contacts;
  return (
    <div onClick={onClick} className="group border-b border-border px-5 py-3 hover:bg-accent cursor-pointer transition-colors">
      <div className="flex items-start gap-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium capitalize shrink-0 mt-0.5', MSG_TYPE_COLOR[row.type] ?? 'bg-gray-100 text-gray-600')}>
          {row.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <span>{contact?.name ?? contact?.phone ?? row.sender_type}</span>
            <ArrowRight className="h-2.5 w-2.5" />
            <span className="text-[10px]">{format(new Date(row.created_at), 'MMM d, HH:mm')}</span>
          </p>
          <p className="text-sm mt-0.5 line-clamp-2">{row.content || <span className="italic text-muted-foreground">[{row.type}]</span>}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className={cn('text-[10px] rounded px-1.5 py-0.5', row.status === 'read' ? 'bg-violet-100 text-violet-600' : row.status === 'delivered' ? 'bg-sky-100 text-sky-600' : 'bg-gray-100 text-gray-600')}>
            {row.status}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

// ── Delivery panel ─────────────────────────────────────────────────────────────
function DeliveryPanel({ buckets, total }: { buckets: Record<string, number>; total: number }) {
  const colors: Record<string, string> = {
    sent: 'bg-blue-500', delivered: 'bg-sky-500', read: 'bg-violet-500',
    failed: 'bg-red-500', queued: 'bg-gray-400',
  };
  const order = ['read', 'delivered', 'sent', 'queued', 'failed'];
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {order.filter((s) => buckets[s] !== undefined).map((s) => {
          const count = buckets[s] ?? 0;
          const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={s} className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-2xl font-bold">{count.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">{s}</p>
              <p className="text-[11px] font-medium text-brand-600">{pct}%</p>
            </div>
          );
        })}
      </div>
      <div className="space-y-3">
        {order.filter((s) => buckets[s] !== undefined).map((s) => {
          const count = buckets[s] ?? 0;
          const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={s}>
              <div className="flex justify-between text-xs mb-1">
                <span className="capitalize font-medium">{s}</span>
                <span className="text-muted-foreground">{count.toLocaleString()} messages</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', colors[s] ?? 'bg-gray-400')} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────────
interface AnalyticsDrawerProps {
  type: DrawerType | null;
  from: string;
  to: string;
  open: boolean;
  onClose: () => void;
}

export function AnalyticsDrawer({ type, from, to, open, onClose }: AnalyticsDrawerProps) {
  const router  = useRouter();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useAnalyticsDetail(type, from, to);

  const rows   = (data?.rows ?? []) as Record<string, unknown>[];
  const buckets = data?.buckets;
  const total   = buckets ? Object.values(buckets).reduce((a, b) => a + b, 0) : 0;

  const csatDist = (data as any)?.scoreDist as Array<{ score: number; count: number }> | undefined;
  const csatAvg  = (data as any)?.avg as number | null | undefined;

  // Search filter (client-side)
  const filtered = search.trim()
    ? rows.filter((r) => {
        const s = search.toLowerCase();
        const anyR = r as any;
        const cname   = (anyR.contacts?.name as string | undefined)?.toLowerCase() ?? '';
        const cphone  = (anyR.contacts?.phone as string | undefined)?.toLowerCase() ?? (anyR.phone as string | undefined)?.toLowerCase() ?? '';
        const content = (anyR.content as string | undefined)?.toLowerCase() ?? '';
        const fname   = (anyR.name as string | undefined)?.toLowerCase() ?? '';
        return cname.includes(s) || cphone.includes(s) || content.includes(s) || fname.includes(s);
      })
    : rows;

  const isConv    = type === 'open' || type === 'resolved' || type === 'pending' || type === 'assigned';
  const isContact = type === 'new-contacts';
  const isCsat    = type === 'csat';
  const isMsg     = type === 'inbound' || type === 'outbound';
  const isDelivery = type === 'delivery';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { onClose(); setSearch(''); } }}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        {/* Header — no extra close button, Sheet has its own */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <SheetTitle className="text-base">{type ? DRAWER_TITLES[type] : ''}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {from} → {to}
            {!isDelivery && <> · <span className="font-medium text-foreground">{filtered.length}</span> {search ? `of ${rows.length}` : ''} records</>}
          </p>
        </SheetHeader>

        {/* CSAT score distribution */}
        {isCsat && csatDist && (
          <div className="px-5 py-3 border-b border-border bg-muted/30 space-y-2 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score Distribution</p>
              {csatAvg && <span className="text-sm font-bold text-amber-500 flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{csatAvg} avg</span>}
            </div>
            {[5,4,3,2,1].map((s) => {
              const item = csatDist.find((d) => d.score === s);
              return <ScoreBar key={s} score={s} count={item?.count ?? 0} total={rows.length} />;
            })}
          </div>
        )}

        {/* Search bar */}
        {!isDelivery && (
          <div className="px-5 py-2.5 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isConv ? 'Search by name or phone…' : isMsg ? 'Search messages…' : 'Search…'}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : isDelivery && buckets ? (
            <DeliveryPanel buckets={buckets} total={total} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p className="text-sm">{search ? 'No matches found' : 'No data for this period'}</p>
            </div>
          ) : isConv ? (
            filtered.map((r, i) => (
              <ConvCard key={i} row={r as unknown as ConvRow} onClick={() => { router.push(`/conversations/${r.id as string}`); onClose(); setSearch(''); }} />
            ))
          ) : isContact ? (
            filtered.map((r, i) => <ContactCard key={i} row={r as unknown as ContactRow} />)
          ) : isCsat ? (
            filtered.map((r, i) => <CsatCard key={i} row={r as unknown as CsatRow} />)
          ) : isMsg ? (
            filtered.map((r, i) => (
              <MsgCard key={i} row={r as unknown as MsgRow} onClick={() => { router.push(`/conversations/${(r as unknown as MsgRow).conversation_id}`); onClose(); setSearch(''); }} />
            ))
          ) : null}
        </div>

        {/* Footer */}
        {!isDelivery && !isLoading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            {isConv && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => { router.push('/conversations'); onClose(); }}>
                <Users className="h-3.5 w-3.5" /> View all conversations
              </Button>
            )}
            {isContact && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => { router.push('/contacts'); onClose(); }}>
                <Users className="h-3.5 w-3.5" /> View all contacts
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

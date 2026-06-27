'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/store/workspace.store';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Download, MessageSquare, Send, CheckCheck, Eye,
  XCircle, Reply, Users, Clock, Timer, Search, Zap, Calendar,
  FileText, Image, Video, Filter, StopCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, formatDistanceStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DailyStatRow } from '@/app/api/campaigns/[id]/daily-stats/route';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt) return null;
  return formatDistanceStrict(new Date(startedAt), completedAt ? new Date(completedAt) : new Date());
}
function sendSpeed(total: number, startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || total === 0) return null;
  const mins = (( completedAt ? new Date(completedAt) : new Date()).getTime() - new Date(startedAt).getTime()) / 60_000;
  if (mins < 0.01) return null;
  return `${Math.round(total / mins)}/min`;
}
function diffLabel(a: string | null, b: string | null): string {
  if (!a || !b) return '—';
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return '—';
  const m = Math.round(ms / 60000);
  if (m === 0) return '< 1m';
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0; }

// ── Types ─────────────────────────────────────────────────────────────────────
interface Recipient {
  id: string; phone: string; name: string | null; status: string;
  sent_at: string | null; delivered_at: string | null; read_at: string | null;
  replied_at: string | null; reply_type: string | null; reply_text: string | null;
  error_message: string | null; conversation_id: string | null;
  filtered_reason: string | null;
}
interface Stats { total: number; sent: number; delivered: number; read: number; failed: number; replied: number; filtered: number; button_replies: number; text_replies: number; }
interface Campaign {
  id: string; name: string; status: string; audience_type: string; audience_filter: Record<string, unknown> | null;
  total_recipients: number; sent_count: number; failed_count: number; delivered_count: number; read_count: number;
  scheduled_at: string | null; started_at: string | null; completed_at: string | null; created_at: string;
  media_id: string | null; media_type: string | null;
  templates: { id: string; name: string; header_type: string | null; body: string | null; buttons: Array<{ type: string; text: string }> | null } | null;
}
interface DetailData {
  campaign: Campaign; stats: Stats; unique_reply_texts: Array<{ text: string; count: number }>;
  recipients: Recipient[]; total: number; page: number; pages: number;
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  sent:      { label: 'Sent',      icon: Send,       color: 'text-blue-600',    bg: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-700'      },
  delivered: { label: 'Delivered', icon: CheckCheck, color: 'text-sky-600',     bg: 'bg-sky-50',     badge: 'bg-sky-100 text-sky-700'        },
  read:      { label: 'Read',      icon: Eye,        color: 'text-violet-600',  bg: 'bg-violet-50',  badge: 'bg-violet-100 text-violet-700'  },
  replied:   { label: 'Replied',   icon: Reply,      color: 'text-emerald-600', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700'},
  failed:    { label: 'Failed',    icon: XCircle,    color: 'text-red-600',     bg: 'bg-red-50',     badge: 'bg-red-100 text-red-700'        },
  filtered:  { label: 'Filtered',  icon: Filter,     color: 'text-orange-600',  bg: 'bg-orange-50',  badge: 'bg-orange-100 text-orange-700'  },
} as const;

const CHART_COLORS = { sent: '#f59e0b', delivered: '#0ea5e9', read: '#8b5cf6', replied: '#10b981', failed: '#ef4444' };

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', scheduled: 'bg-blue-100 text-blue-700',
  running: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

// ── Stat pill (tab header) ────────────────────────────────────────────────────
function StatPill({ label, value, total, icon: Icon, active, onClick }: {
  label: string; value: number; total: number; icon: React.ElementType; active: boolean; onClick: () => void;
}) {
  const p = pct(value, total);
  return (
    <button onClick={onClick} className={cn(
      'flex flex-col items-start px-4 py-3 border-b-2 transition-all whitespace-nowrap min-w-[110px]',
      active ? 'border-brand-500 bg-brand-50/50' : 'border-transparent hover:border-muted-foreground/30 hover:bg-muted/30',
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('h-3.5 w-3.5', active ? 'text-brand-500' : 'text-muted-foreground')} />
        <span className={cn('text-xs font-medium', active ? 'text-brand-600' : 'text-muted-foreground')}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-foreground tabular-nums">{value.toLocaleString()}</span>
        {label !== 'Overview' && total > 0 && (
          <span className={cn('text-xs font-semibold', active ? 'text-brand-500' : 'text-muted-foreground')}>{p}%</span>
        )}
      </div>
    </button>
  );
}

// ── Small stat card ───────────────────────────────────────────────────────────
function MiniStat({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Download CSV helper ───────────────────────────────────────────────────────
function downloadTab(campaignId: string, workspaceId: string, status: string, repliedWithin?: string, replyFilter?: string, replyType?: string) {
  const p = new URLSearchParams({ workspaceId, status, export: '1', page: '1' });
  if (repliedWithin) p.set('replied_within', repliedWithin);
  if (replyFilter)   p.set('reply_filter', replyFilter);
  if (replyType)     p.set('reply_type', replyType);
  window.open(`/api/campaigns/${campaignId}/recipients?${p}`, '_blank');
}

// ── Recipient table shared ────────────────────────────────────────────────────
function RecipientTable({ recipients, loading, tab, router, campaignId, workspaceId }: {
  recipients: Recipient[]; loading: boolean; tab: string;
  router: ReturnType<typeof useRouter>; campaignId: string; workspaceId: string;
}) {
  const showDelivered = ['delivered', 'read', 'replied', 'all'].includes(tab);
  const showRead      = ['read', 'replied', 'all'].includes(tab);
  const showReplied    = ['replied', 'all'].includes(tab);
  const showError      = tab === 'failed';
  const showReplyData  = ['replied', 'all'].includes(tab);
  const showFiltered   = tab === 'filtered';

  if (loading) return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
    </div>
  );
  if (recipients.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Users className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm">No contacts in this segment</p>
    </div>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30">
          <TableHead>Contact</TableHead>
          <TableHead>Mobile</TableHead>
          <TableHead>Sent At</TableHead>
          {showDelivered && <TableHead>Delivered</TableHead>}
          {showRead      && <TableHead>Read At</TableHead>}
          {showReplied   && <TableHead>Replied At</TableHead>}
          {showReplyData && <TableHead>Reply Type</TableHead>}
          {showReplyData && <TableHead>Reply Text</TableHead>}
          {showError      && <TableHead>Error Reason</TableHead>}
          {showFiltered   && <TableHead>Filter Reason</TableHead>}
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((r) => {
          const cfg = STATUS_CFG[r.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.sent;
          const Icon = cfg.icon;
          return (
            <TableRow key={r.id} className="hover:bg-accent/50">
              <TableCell>
                <div>
                  <p className="text-sm font-medium">{r.name ?? '—'}</p>
                  <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 mt-0.5', cfg.badge)}>
                    <Icon className="h-2.5 w-2.5" />{cfg.label}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-xs font-mono text-muted-foreground">{r.phone}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.sent_at ? format(new Date(r.sent_at), 'MMM d, HH:mm') : '—'}
              </TableCell>
              {showDelivered && (
                <TableCell className="text-xs text-muted-foreground">
                  {r.delivered_at ? (
                    <div>
                      <p>{format(new Date(r.delivered_at), 'MMM d, HH:mm')}</p>
                      <p className="text-[10px] text-sky-500">{diffLabel(r.sent_at, r.delivered_at)}</p>
                    </div>
                  ) : '—'}
                </TableCell>
              )}
              {showRead && (
                <TableCell className="text-xs text-muted-foreground">
                  {r.read_at ? (
                    <div>
                      <p>{format(new Date(r.read_at), 'MMM d, HH:mm')}</p>
                      <p className="text-[10px] text-violet-500">{diffLabel(r.delivered_at, r.read_at)}</p>
                    </div>
                  ) : '—'}
                </TableCell>
              )}
              {showReplied && (
                <TableCell className="text-xs text-muted-foreground">
                  {r.replied_at ? (
                    <div>
                      <p>{format(new Date(r.replied_at), 'MMM d, HH:mm')}</p>
                      <p className="text-[10px] text-emerald-500">{diffLabel(r.sent_at, r.replied_at)}</p>
                    </div>
                  ) : '—'}
                </TableCell>
              )}
              {showReplyData && (
                <TableCell>
                  {r.reply_type ? (
                    <span className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5',
                      r.reply_type === 'button' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700',
                    )}>
                      {r.reply_type === 'button' ? '🔘' : '💬'} {r.reply_type}
                    </span>
                  ) : '—'}
                </TableCell>
              )}
              {showReplyData && (
                <TableCell className="text-xs max-w-[160px] truncate" title={r.reply_text ?? ''}>
                  {r.reply_text ?? '—'}
                </TableCell>
              )}
              {showError && (
                <TableCell className="text-xs text-red-500 max-w-[200px]" title={r.error_message ?? ''}>
                  {r.error_message ? (
                    <span className="truncate block">{r.error_message}</span>
                  ) : '—'}
                </TableCell>
              )}
              {showFiltered && (
                <TableCell className="text-xs text-orange-600">
                  {r.filtered_reason === 'no_whatsapp'
                    ? 'Not on WhatsApp'
                    : r.filtered_reason === 'repeat_campaign_fail'
                    ? 'Failed in 2+ previous campaigns'
                    : r.filtered_reason ?? '—'}
                </TableCell>
              )}
              <TableCell>
                {r.conversation_id && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Open conversation"
                    onClick={() => router.push(`/conversations/${r.conversation_id}`)}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ campaign, stats, daily, loading, workspaceId }: {
  campaign: Campaign; stats: Stats; daily: DailyStatRow[]; loading: boolean; workspaceId: string;
}) {
  const tpl    = campaign.templates;
  const mType  = campaign.media_type;

  const af = campaign.audience_filter;
  const audienceLabel = campaign.audience_type === 'all' ? 'All Contacts'
    : campaign.audience_type === 'tag'      ? `Tag: ${af?.tag ?? ''}`
    : campaign.audience_type === 'tags'     ? `Tags: ${(af?.tags as string[] | undefined)?.join(', ') ?? ''}`
    : campaign.audience_type === 'contacts' ? `${(af?.contact_ids as unknown[] | undefined)?.length ?? 0} specific contacts`
    : campaign.audience_type === 'manual'   ? `${(af?.phones as unknown[] | undefined)?.length ?? 0} phone numbers`
    : campaign.audience_type;

  const mediaIcon = mType === 'image' ? Image : mType === 'video' ? Video : FileText;
  const MediaIcon = mediaIcon;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: campaign info */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Campaign Info</h3>
          {[
            { label: 'Campaign Type', value: 'BROADCAST' },
            { label: 'Message Type',  value: tpl ? `TEMPLATE${mType ? ` (${mType.toUpperCase()})` : ''}` : '—' },
            { label: 'Template Name', value: tpl?.name ?? '—' },
            { label: 'Audience',      value: audienceLabel },
            { label: 'Created At',    value: campaign.created_at ? format(new Date(campaign.created_at), 'MMM d, yyyy HH:mm') : '—' },
            { label: 'Started At',    value: campaign.started_at ? format(new Date(campaign.started_at), 'MMM d, yyyy HH:mm') : '—' },
            { label: 'Completed At',  value: campaign.completed_at ? format(new Date(campaign.completed_at), 'MMM d, yyyy HH:mm') : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-2">
              <span className="text-xs text-muted-foreground shrink-0">{label}</span>
              <span className="text-xs font-medium text-foreground text-right truncate max-w-[160px]" title={value}>{value}</span>
            </div>
          ))}
          {campaign.started_at && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                <Zap className="h-3.5 w-3.5" />
                {fmtDuration(campaign.started_at, campaign.completed_at) ?? 'Running…'}
                {campaign.completed_at && ' to complete'}
              </div>
              {sendSpeed(stats.sent, campaign.started_at, campaign.completed_at) && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {sendSpeed(stats.sent, campaign.started_at, campaign.completed_at)} send speed
                </p>
              )}
            </div>
          )}
        </div>

        {/* Template preview */}
        {tpl?.body && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Template Preview</h3>
            {campaign.media_id && (
              mType === 'image' ? (
                <div className="rounded-lg overflow-hidden border border-border h-36 bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={campaign.media_id.startsWith('http') ? campaign.media_id : `/api/media/proxy?mediaId=${encodeURIComponent(campaign.media_id)}&workspaceId=${encodeURIComponent(workspaceId)}`}
                    alt="Campaign media"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = 'none';
                      const fb = el.parentElement;
                      if (fb) {
                        fb.innerHTML = `<div class="flex items-center justify-center h-full gap-2 text-muted-foreground"><svg class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg><span class="text-xs">image attachment</span></div>`;
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="rounded-lg bg-muted flex items-center justify-center h-20 border border-border gap-2">
                  <MediaIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{mType} attachment</span>
                </div>
              )
            )}
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{tpl.body}</p>
            {tpl.buttons && tpl.buttons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tpl.buttons.map((btn, i) => (
                  <span key={i} className="text-[10px] rounded-md border border-blue-300 bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">{btn.text}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: stats + chart */}
      <div className="lg:col-span-2 space-y-5">
        {/* Big stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />) : [
            { label: 'Sent',      value: stats.sent,      sub: `${pct(stats.sent, stats.total)}% of audience`,      icon: Send,       color: 'text-blue-600'    },
            { label: 'Delivered', value: stats.delivered, sub: `${pct(stats.delivered, stats.sent)}% of sent`,      icon: CheckCheck, color: 'text-sky-600'     },
            { label: 'Read',      value: stats.read,      sub: `${pct(stats.read, stats.delivered)}% of delivered`, icon: Eye,        color: 'text-violet-600'  },
            { label: 'Replied',   value: stats.replied,   sub: `${pct(stats.replied, stats.sent)}% of sent`,        icon: Reply,      color: 'text-emerald-600' },
          ].map(({ label, value, sub, icon, color }) => (
            <MiniStat key={label} label={label} value={value.toLocaleString()} sub={sub} icon={icon} color={color} />
          ))}
        </div>

        {/* Funnel */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Delivery Funnel</h3>
          {[
            { label: 'Sent',      value: stats.sent,      total: stats.total, color: 'bg-blue-500'    },
            { label: 'Delivered', value: stats.delivered, total: stats.sent,  color: 'bg-sky-500'     },
            { label: 'Read',      value: stats.read,      total: stats.sent,  color: 'bg-violet-500'  },
            { label: 'Replied',   value: stats.replied,   total: stats.sent,  color: 'bg-emerald-500' },
            { label: 'Failed',    value: stats.failed,    total: stats.total, color: 'bg-red-500'     },
            { label: 'Filtered',  value: stats.filtered,  total: stats.total, color: 'bg-orange-500'  },
          ].map(({ label, value, total, color }) => {
            const p2 = pct(value, total);
            return (
              <div key={label} className="flex items-center gap-3">
                <span className="w-20 text-xs text-muted-foreground shrink-0">{label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${p2}%` }} />
                </div>
                <span className="w-24 text-right text-xs font-semibold text-foreground tabular-nums">
                  {value.toLocaleString()} <span className="text-muted-foreground font-normal">({p2}%)</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Per-day chart */}
        {daily.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Campaign Messages (per day)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => format(new Date(d + 'T00:00:00'), 'MMM d')} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip labelFormatter={(d) => format(new Date(d + 'T00:00:00'), 'MMM d, yyyy')} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {(['sent', 'delivered', 'read', 'replied', 'failed'] as const).map((key) => (
                  <Area key={key} type="monotone" dataKey={key} stackId="none"
                    stroke={CHART_COLORS[key]} fill={CHART_COLORS[key]} fillOpacity={0.12}
                    strokeWidth={2} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Button Click Breakdown (Replied tab) ──────────────────────────────────────
function ButtonBreakdown({ uniqueReplyTexts, buttonReplies, totalReplied }: {
  uniqueReplyTexts: Array<{ text: string; count: number }>;
  buttonReplies: number;
  totalReplied: number;
}) {
  if (buttonReplies === 0) return null;
  const buttonTexts = uniqueReplyTexts.filter(({ text }) =>
    text && !text.startsWith('[') && text.length < 60
  );
  if (!buttonTexts.length) return null;
  return (
    <div className="border-b border-border px-5 py-4 space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Button Click Breakdown
      </h3>
      {buttonTexts.map(({ text, count }) => (
        <div key={text} className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{text}</span>
          <div className="w-32 h-2 rounded-full bg-muted overflow-hidden shrink-0">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct(count, buttonReplies)}%` }} />
          </div>
          <span className="text-xs font-semibold text-foreground w-20 text-right shrink-0">
            {count} <span className="text-muted-foreground font-normal">({pct(count, totalReplied)}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Failed Tab extras ─────────────────────────────────────────────────────────
function ErrorBreakdown({ recipients }: { recipients: Recipient[] }) {
  const counts: Record<string, number> = {};
  for (const r of recipients) {
    const err = r.error_message ?? 'Unknown';
    const key = err.length > 60 ? err.slice(0, 60) + '…' : err;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total  = recipients.length;
  if (!sorted.length) return null;

  return (
    <div className="border-b border-border px-5 py-4 space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Error Breakdown</h3>
      {sorted.map(([err, n]) => (
        <div key={err} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0" title={err}>{err}</span>
          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
            <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct(n, total)}%` }} />
          </div>
          <span className="text-xs font-semibold text-foreground w-16 text-right shrink-0">{n} ({pct(n, total)}%)</span>
        </div>
      ))}
    </div>
  );
}

// ── Replied tab smart segregation bar ────────────────────────────────────────
function SmartSegBar({ repliedWithin, setRepliedWithin, replyFilter, setReplyFilter, uniqueReplyTexts, onBroadcast, onDownload }: {
  repliedWithin: string; setRepliedWithin: (v: string) => void;
  replyFilter: string;   setReplyFilter:   (v: string) => void;
  uniqueReplyTexts: Array<{ text: string; count: number }>; onBroadcast: () => void; onDownload: () => void;
}) {
  return (
    <div className="border-b border-border px-5 py-3 bg-muted/20">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground">Replied In:</span>
        {[{ v: '', label: 'All Time' }, { v: '1', label: '1 Hour' }, { v: '3', label: '3 Hours' }, { v: '24', label: '24 Hours' }].map(({ v, label }) => (
          <button key={v} onClick={() => setRepliedWithin(v)}
            className={cn('text-xs rounded-full px-3 py-1 border font-medium transition-all',
              repliedWithin === v ? 'bg-brand-500 text-white border-brand-500' : 'border-border text-muted-foreground hover:border-brand-400')}>
            {label}
          </button>
        ))}
        {uniqueReplyTexts.length > 0 && (
          <>
            <span className="text-xs font-semibold text-muted-foreground ml-2">Reply:</span>
            <select
              value={replyFilter}
              onChange={(e) => setReplyFilter(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All Replies</option>
              {uniqueReplyTexts.map(({ text, count }) => <option key={text} value={text}>{text} ({count})</option>)}
            </select>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" className="h-7 gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs" onClick={onBroadcast}>
            <Send className="h-3 w-3" /> Broadcast
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onDownload}>
            <Download className="h-3 w-3" /> Download CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface CampaignDetailProps { campaignId: string }

type TabKey = 'overview' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'filtered';

export function CampaignDetail({ campaignId }: CampaignDetailProps) {
  const router      = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [tab,             setTab]             = useState<TabKey>('overview');
  const [page,            setPage]            = useState(1);
  const [search,          setSearch]          = useState('');
  const [repliedWithin,   setRepliedWithin]   = useState('');
  const [replyFilter,     setReplyFilter]     = useState('');
  const [replyTypeFilter, setReplyTypeFilter] = useState('');
  const [cancelling,      setCancelling]      = useState(false);
  const [resuming,        setResuming]        = useState(false);

  const switchTab = useCallback((t: TabKey) => { setTab(t); setPage(1); setSearch(''); setReplyTypeFilter(''); setReplyFilter(''); setRepliedWithin(''); }, []);

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this campaign? Its status will be set to failed.\n\nWARNING: If you cancel and create a new campaign for the same contacts, those contacts will be messaged again (double-charge). Use "Resume" instead to continue from where it left off.')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/cancel`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Cancel failed'); return; }
      toast.success('Campaign cancelled');
      router.refresh();
    } catch { toast.error('Cancel failed'); }
    finally { setCancelling(false); }
  }, [campaignId, router]);

  const handleResume = useCallback(async () => {
    const msg = data?.campaign?.status === 'completed'
      ? 'Send to remaining contacts? Contacts already messaged in this campaign will be skipped automatically — no double sends.'
      : 'Resume this campaign? It will continue from where it left off — contacts already messaged will be skipped automatically.';
    if (!confirm(msg)) return;
    setResuming(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resume`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Resume failed'); return; }
      toast.success('Campaign re-queued — will resume within 5 minutes');
      router.refresh();
    } catch { toast.error('Resume failed'); }
    finally { setResuming(false); }
  }, [campaignId, router]);

  // Main recipients + stats query
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-detail', campaignId, workspaceId, tab, page, search, repliedWithin, replyFilter, replyTypeFilter],
    queryFn: async (): Promise<DetailData> => {
      const p = new URLSearchParams({ workspaceId, status: tab === 'overview' ? 'all' : tab, page: String(page) });
      if (search)          p.set('search', search);
      if (repliedWithin)   p.set('replied_within', repliedWithin);
      if (replyFilter)     p.set('reply_filter', replyFilter);
      if (replyTypeFilter) p.set('reply_type', replyTypeFilter);
      const res = await fetch(`/api/campaigns/${campaignId}/recipients?${p}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!workspaceId,
    refetchInterval: (q) => q.state.data?.campaign?.status === 'running' ? 5000 : false,
  });

  // Daily stats for overview chart
  const { data: dailyData } = useQuery({
    queryKey: ['campaign-daily', campaignId, workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/daily-stats?workspaceId=${workspaceId}`);
      if (!res.ok) return { daily: [] };
      return res.json() as Promise<{ daily: DailyStatRow[] }>;
    },
    enabled: !!workspaceId && tab === 'overview',
  });

  const campaign   = data?.campaign;
  const stats      = data?.stats ?? { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, replied: 0, filtered: 0, button_replies: 0, text_replies: 0 };
  const recipients = data?.recipients ?? [];
  const uniqueReplyTexts = data?.unique_reply_texts ?? [];

  const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; count: number }> = [
    { key: 'overview',  label: 'Overview',  icon: Users,      count: stats.total     },
    { key: 'sent',      label: 'Sent',      icon: Send,       count: stats.sent      },
    { key: 'delivered', label: 'Delivered', icon: CheckCheck, count: stats.delivered },
    { key: 'read',      label: 'Read',      icon: Eye,        count: stats.read      },
    { key: 'replied',   label: 'Replied',   icon: Reply,      count: stats.replied   },
    { key: 'failed',    label: 'Failed',    icon: XCircle,    count: stats.failed    },
    { key: 'filtered',  label: 'Filtered',  icon: Filter,     count: stats.filtered  },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── Top header ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push('/campaigns')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {isLoading
            ? <Skeleton className="h-5 w-48" />
            : <h1 className="truncate text-base font-semibold text-foreground">{campaign?.name}</h1>}
        </div>
        {campaign && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize shrink-0', CAMPAIGN_STATUS_COLORS[campaign.status] ?? 'bg-gray-100 text-gray-600')}>
            {campaign.status}
          </span>
        )}
        {/* Resume / Send to Remaining button */}
        {campaign && (campaign.status === 'running' || campaign.status === 'failed' || campaign.status === 'completed') && (
          <Button size="sm" variant="outline"
            className="h-7 gap-1.5 text-xs shrink-0 border-green-200 text-green-700 hover:bg-green-50"
            onClick={handleResume} disabled={resuming}>
            <Zap className="h-3.5 w-3.5" />
            {resuming
              ? 'Queuing…'
              : campaign.status === 'completed'
                ? 'Send to Remaining'
                : 'Resume Campaign'}
          </Button>
        )}
        {/* Cancel button — only for running/scheduled campaigns */}
        {campaign && (campaign.status === 'running' || campaign.status === 'scheduled') && (
          <Button size="sm" variant="outline"
            className="h-7 gap-1.5 text-xs shrink-0 border-red-200 text-red-600 hover:bg-red-50"
            onClick={handleCancel} disabled={cancelling}>
            <StopCircle className="h-3.5 w-3.5" />
            {cancelling ? 'Cancelling…' : 'Cancel Campaign'}
          </Button>
        )}
        {/* Overview full export */}
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs shrink-0"
          onClick={() => campaign && downloadTab(campaignId, workspaceId, 'all')}
          disabled={!campaign || campaign.status === 'draft'}>
          <Download className="h-3.5 w-3.5" /> Export All
        </Button>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex border-b border-border bg-card overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <StatPill
            key={key}
            label={label}
            value={count}
            total={stats.total}
            icon={Icon}
            active={tab === key}
            onClick={() => switchTab(key)}
          />
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Overview tab */}
        {tab === 'overview' && (
          isLoading || !campaign
            ? <div className="p-6 space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
            : <OverviewTab campaign={campaign} stats={stats} daily={dailyData?.daily ?? []} loading={false} workspaceId={workspaceId} />
        )}

        {/* Sent / Delivered / Read tabs */}
        {['sent', 'delivered', 'read'].includes(tab) && (
          <div className="rounded-none">
            {/* Tab stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-border">
              {tab === 'sent' && [
                { label: 'Total Sent',    value: stats.sent,      icon: Send,       color: 'text-blue-600',   sub: `${pct(stats.sent, stats.total)}% of audience` },
                { label: 'Send Speed',    value: sendSpeed(stats.sent, campaign?.started_at ?? null, campaign?.completed_at ?? null) ?? '—', icon: Zap, color: 'text-amber-500', sub: 'messages per minute' },
                { label: 'Duration',      value: fmtDuration(campaign?.started_at ?? null, campaign?.completed_at ?? null) ?? '—', icon: Timer, color: 'text-orange-500', sub: 'to complete' },
                { label: 'Not Sent',      value: stats.total - stats.sent, icon: XCircle, color: 'text-red-500', sub: 'failed or pending' },
              ].map((s) => <MiniStat key={s.label} {...s} value={String(s.value)} />)}

              {tab === 'delivered' && [
                { label: 'Delivered',      value: stats.delivered, icon: CheckCheck, color: 'text-sky-600',    sub: `${pct(stats.delivered, stats.sent)}% of sent` },
                { label: 'Not Delivered',  value: stats.sent - stats.delivered, icon: XCircle, color: 'text-red-500', sub: 'sent but undelivered' },
                { label: 'Read After',     value: stats.read,      icon: Eye,        color: 'text-violet-600', sub: `${pct(stats.read, stats.delivered)}% of delivered` },
                { label: 'Replied After',  value: stats.replied,   icon: Reply,      color: 'text-emerald-600', sub: `${pct(stats.replied, stats.delivered)}% of delivered` },
              ].map((s) => <MiniStat key={s.label} {...s} value={String(s.value)} />)}

              {tab === 'read' && [
                { label: 'Read',           value: stats.read,      icon: Eye,        color: 'text-violet-600', sub: `${pct(stats.read, stats.delivered)}% of delivered` },
                { label: 'Not Read',       value: stats.delivered - stats.read, icon: XCircle, color: 'text-red-500', sub: 'delivered but not read' },
                { label: 'Replied After',  value: stats.replied,   icon: Reply,      color: 'text-emerald-600', sub: `${pct(stats.replied, stats.read)}% of readers` },
                { label: 'Read Rate',      value: `${pct(stats.read, stats.sent)}%`, icon: Eye, color: 'text-violet-500', sub: 'of total sent' },
              ].map((s) => <MiniStat key={s.label} {...s} value={String(s.value)} />)}
            </div>

            {/* Search + download bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search name or mobile…" value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-sm" />
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs ml-auto"
                onClick={() => downloadTab(campaignId, workspaceId, tab)}>
                <Download className="h-3.5 w-3.5" /> Download CSV
              </Button>
            </div>

            <RecipientTable recipients={recipients} loading={isLoading} tab={tab} router={router} campaignId={campaignId} workspaceId={workspaceId} />
            <Pagination data={data} page={page} setPage={setPage} />
          </div>
        )}

        {/* Replied tab */}
        {tab === 'replied' && (
          <div>
            {/* Stats — clickable to filter */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-border">
              {[
                { label: 'Total Replied', value: String(stats.replied),        icon: Reply,         color: 'text-emerald-600', sub: `${pct(stats.replied, stats.sent)}% reply rate`,   filterVal: '' },
                { label: 'Button Clicks', value: String(stats.button_replies), icon: Filter,        color: 'text-blue-600',    sub: 'tapped a template button',                        filterVal: 'button' },
                { label: 'Text Replies',  value: String(stats.text_replies),   icon: MessageSquare, color: 'text-violet-600',  sub: 'typed a reply',                                   filterVal: 'text' },
                { label: 'Unique Replies',value: String(uniqueReplyTexts.length), icon: CheckCheck, color: 'text-sky-600',     sub: 'distinct messages',                               filterVal: null },
              ].map((s) => {
                const isClickable = s.filterVal !== null;
                const isActive = isClickable && replyTypeFilter === s.filterVal;
                return isClickable ? (
                  <button key={s.label} onClick={() => { setReplyTypeFilter(s.filterVal as string); setReplyFilter(''); setPage(1); }}
                    className={cn('rounded-xl border p-4 text-left transition-all', isActive ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400' : 'border-border bg-card hover:border-brand-300 hover:bg-brand-50/40')}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <s.icon className={cn('h-4 w-4', s.color)} />
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>
                  </button>
                ) : (
                  <MiniStat key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} sub={s.sub} />
                );
              })}
            </div>

            {/* Button click breakdown bars */}
            <ButtonBreakdown
              uniqueReplyTexts={uniqueReplyTexts}
              buttonReplies={stats.button_replies}
              totalReplied={stats.replied}
            />

            {/* Reply breakdown pills — truncated to prevent overflow */}
            {uniqueReplyTexts.length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-border">
                <span className="text-xs text-muted-foreground self-center mr-1">Filter:</span>
                {uniqueReplyTexts.map(({ text, count }) => {
                  const label = text.length > 35 ? text.slice(0, 35) + '…' : text;
                  return (
                    <button key={text} onClick={() => { setReplyFilter(replyFilter === text ? '' : text); setReplyTypeFilter(''); setPage(1); }}
                      title={text}
                      className={cn('text-xs rounded-full px-3 py-1 border font-medium transition-all max-w-[200px] truncate',
                        replyFilter === text ? 'bg-emerald-500 text-white border-emerald-500' : 'border-border text-muted-foreground hover:border-emerald-400')}>
                      {label} <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Smart segregation bar */}
            <SmartSegBar
              repliedWithin={repliedWithin} setRepliedWithin={(v) => { setRepliedWithin(v); setPage(1); }}
              replyFilter={replyFilter}     setReplyFilter={(v)   => { setReplyFilter(v);   setPage(1); }}
              uniqueReplyTexts={uniqueReplyTexts}
              onBroadcast={() => {
                const phones = recipients.map((r) => r.phone).join(',');
                router.push(`/campaigns?broadcast_to=${encodeURIComponent(phones)}`);
              }}
              onDownload={() => downloadTab(campaignId, workspaceId, 'replied', repliedWithin || undefined, replyFilter || undefined, replyTypeFilter || undefined)}
            />

            <RecipientTable recipients={recipients} loading={isLoading} tab="replied" router={router} campaignId={campaignId} workspaceId={workspaceId} />
            <Pagination data={data} page={page} setPage={setPage} />
          </div>
        )}

        {/* Failed tab */}
        {tab === 'failed' && (
          <div>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-5 border-b border-border">
              {[
                { label: 'Total Failed', value: stats.failed, icon: XCircle, color: 'text-red-600', sub: `${pct(stats.failed, stats.total)}% failure rate` },
                { label: 'Sent Success', value: stats.sent,   icon: Send,    color: 'text-blue-600', sub: `${pct(stats.sent, stats.total)}% sent successfully` },
                { label: 'Audience',     value: stats.total,  icon: Users,   color: 'text-foreground', sub: 'total contacts targeted' },
              ].map((s) => <MiniStat key={s.label} {...s} value={String(s.value)} />)}
            </div>

            {/* Error breakdown */}
            <ErrorBreakdown recipients={recipients} />

            {/* Search + retry + download */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search name or mobile…" value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-sm" />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" className="h-8 gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => {
                    const phones = recipients.map((r) => r.phone).join(',');
                    router.push(`/campaigns?broadcast_to=${encodeURIComponent(phones)}`);
                  }}>
                  <Send className="h-3.5 w-3.5" /> Retry Campaign
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                  onClick={() => downloadTab(campaignId, workspaceId, 'failed')}>
                  <Download className="h-3.5 w-3.5" /> Download CSV
                </Button>
              </div>
            </div>

            <RecipientTable recipients={recipients} loading={isLoading} tab="failed" router={router} campaignId={campaignId} workspaceId={workspaceId} />
            <Pagination data={data} page={page} setPage={setPage} />
          </div>
        )}

        {/* Filtered tab */}
        {tab === 'filtered' && (
          <div>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-5 border-b border-border">
              {[
                { label: 'Total Filtered', value: stats.filtered, icon: Filter,  color: 'text-orange-600', sub: `${pct(stats.filtered, stats.total)}% of audience pre-filtered` },
                { label: 'Not on WhatsApp', value: recipients.filter((r) => r.filtered_reason === 'no_whatsapp').length,          icon: XCircle, color: 'text-red-500',    sub: 'cached as invalid number' },
                { label: 'Repeat Failures', value: recipients.filter((r) => r.filtered_reason === 'repeat_campaign_fail').length, icon: Users,   color: 'text-amber-600', sub: 'failed in 2+ past campaigns' },
              ].map((s) => <MiniStat key={s.label} {...s} value={String(s.value)} />)}
            </div>

            {/* Info banner */}
            <div className="mx-5 my-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-700">
              These contacts were skipped before sending — <strong>no WhatsApp message was sent and no charge was incurred</strong> for them.
              Download the list to re-verify numbers or remove them from future campaigns.
            </div>

            {/* Search + download */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search name or mobile…" value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-sm" />
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs ml-auto"
                onClick={() => downloadTab(campaignId, workspaceId, 'filtered')}>
                <Download className="h-3.5 w-3.5" /> Download CSV
              </Button>
            </div>

            <RecipientTable recipients={recipients} loading={isLoading} tab="filtered" router={router} campaignId={campaignId} workspaceId={workspaceId} />
            <Pagination data={data} page={page} setPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ data, page, setPage }: {
  data: DetailData | undefined; page: number; setPage: (p: number) => void;
}) {
  if (!data || (data.pages ?? 0) <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3">
      <span className="text-xs text-muted-foreground">
        Page {page} of {data.pages} · {data.total.toLocaleString()} contacts
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === data.pages} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

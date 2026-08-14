'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  MessageSquare, Users, Target, CheckCircle2, Reply, TrendingUp,
  LayoutDashboard, Send, Eye, MessageCircleReply, MessageCircle, Clock, CalendarCheck,
  Megaphone, AlertCircle, RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { QUICK_RANGES, type QuickRange } from '@/lib/date-range';
import { useWorkspaceStore } from '@/store/workspace.store';
import { KpiCard } from './KpiCard';
import { SectionCard } from './SectionCard';

// ── Chart theme — reused from modules/analytics/components/AnalyticsDashboard ──
const BRAND = '#6366f1', GREEN = '#10b981', SKY = '#0ea5e9', AMBER = '#f59e0b', ROSE = '#ef4444', VIOLET = '#8b5cf6';
const PIE_COLORS = [BRAND, GREEN, AMBER, ROSE, SKY, VIOLET];
const TT = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 };

// ── Payload shape — mirrors GET /api/dashboard/overview (Task 2) exactly ──────
interface Kpi { value: number; pct_change: number | null }
interface DashboardOverview {
  range: { from: string; to: string };
  kpis: {
    total_messages: Kpi;
    total_conversations: Kpi;
    new_leads: Kpi;
    new_contacts: Kpi;
    delivery_rate: Kpi;
    read_rate: Kpi;
    reply_rate: Kpi;
    conversion_rate: Kpi;
  };
  messages: {
    sent: number; delivered: number; read: number; failed: number; replies: number;
    daily: Array<{ label: string; inbound: number; outbound: number }>;
  };
  campaigns: {
    total: number; active: number; completed: number; failed: number; scheduled: number;
    sent: number; delivered: number; read: number; replied: number;
    top: Array<{ name: string; sent: number; replied: number }>;
  };
  leads: {
    total: number; hot: number; warm: number; cold: number; converted: number;
    by_stage: Array<{ stage: string; count: number }>;
  };
  conversations: {
    total: number; open: number; resolved: number; unresolved: number;
    avg_first_response_mins: number | null;
    by_status: Array<{ status: string; count: number }>;
  };
  events: Array<{ type: string; count: number }>;
}

function useDashboardOverview(rangeQs: string | null) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery<DashboardOverview>({
    queryKey: ['dashboard', 'overview', workspaceId, rangeQs],
    queryFn: () =>
      fetch(`/api/dashboard/overview?workspaceId=${workspaceId}&${rangeQs}`)
        .then((r) => {
          if (!r.ok) throw new Error('Failed to fetch dashboard overview');
          return r.json() as Promise<DashboardOverview>;
        }),
    enabled: !!workspaceId && rangeQs !== null,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

// ── Skeletons / Empty ───────────────────────────────────────────────────────
function ChartSkeleton({ h = 56 }: { h?: number }) {
  return <div className={`h-${h}`}><Skeleton className="w-full h-full rounded-lg" /></div>;
}
function Empty({ msg = 'No data for this period' }: { msg?: string }) {
  return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{msg}</div>;
}

// ── Pie label — mirrors AnalyticsDashboard's PieLabel (percent labels inside slices) ──
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }) {
  if (percent < 0.05) return null;
  const R = Math.PI / 180, r = innerRadius + (outerRadius - innerRadius) * 0.5;
  return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{`${(percent * 100).toFixed(0)}%`}</text>;
}

// ── event_type → human label, e.g. "demo_booked" → "Demo Booked" ───────────
function formatEventType(type: string): string {
  return type.split('_').map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

// ── Small stat tile (sub-metrics inside message/campaign sections) ─────────
function StatTile({ label, value, loading }: { label: string; value: number | string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      {loading ? <Skeleton className="h-7 w-12 mx-auto mb-1" /> : (
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      )}
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export function CommandCenter() {
  // ── Global date-range filter — mirrors AnalyticsDashboard's pattern exactly:
  //    quick presets resolve server-side; custom only fires once both from/to
  //    are picked (rangeQs is null until then, holding off the fetch). ────────
  const [quick, setQuick]           = useState<QuickRange>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const isCustom    = quick === 'custom';
  const customReady = !isCustom || (!!customFrom && !!customTo);

  const rangeQs = useMemo(() => {
    if (isCustom) return customReady ? `quick=custom&from=${customFrom}&to=${customTo}` : null;
    return `quick=${quick}`;
  }, [isCustom, customReady, customFrom, customTo, quick]);

  const { data, isLoading, isError, refetch, isFetching } = useDashboardOverview(rangeQs);
  const loading = isLoading || !customReady;
  const k = data?.kpis;
  const m = data?.messages;
  const c = data?.campaigns;
  const l = data?.leads;
  const conv = data?.conversations;
  const ev = data?.events;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between flex-wrap gap-3 border-b border-border bg-card/95 backdrop-blur px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 shrink-0">
            <LayoutDashboard className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Workspace overview — messages, campaigns & leads</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={quick} onValueChange={(v) => setQuick(v as QuickRange)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {QUICK_RANGES.map((r) => (
                <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
              ))}
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {isCustom && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-[135px] text-xs px-2"
                aria-label="Custom range start date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-[135px] text-xs px-2"
                aria-label="Custom range end date"
              />
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void refetch()}
            disabled={loading || isFetching}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8">

        {isError ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="text-sm font-medium text-foreground">Couldn't load the dashboard</p>
              <p className="text-xs text-muted-foreground">Something went wrong fetching this period's data.</p>
              <Button size="sm" variant="outline" onClick={() => void refetch()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : !loading && !data ? (
          <Empty />
        ) : (
          <>
            {/* ══ Headline KPI strip ══════════════════════════════════════════ */}
            <div>
              <SectionCard icon={TrendingUp} title="Overview" sub="Key metrics for the selected period" color="text-brand-600">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard title="Total Messages" value={k?.total_messages.value.toLocaleString() ?? 0}
                    icon={MessageSquare} iconBg="bg-brand-500" loading={loading} pctChange={k?.total_messages.pct_change} />
                  <KpiCard title="Conversations" value={k?.total_conversations.value.toLocaleString() ?? 0}
                    icon={MessageCircleReply} iconBg="bg-sky-500" loading={loading} pctChange={k?.total_conversations.pct_change} />
                  <KpiCard title="New Leads" value={k?.new_leads.value.toLocaleString() ?? 0}
                    icon={Target} iconBg="bg-pink-500" loading={loading} pctChange={k?.new_leads.pct_change} />
                  <KpiCard title="Delivery Rate" value={`${k?.delivery_rate.value ?? 0}%`}
                    icon={CheckCircle2} iconBg="bg-green-500" loading={loading} pctChange={k?.delivery_rate.pct_change} />
                  <KpiCard title="Reply Rate" value={`${k?.reply_rate.value ?? 0}%`}
                    icon={Reply} iconBg="bg-violet-500" loading={loading} pctChange={k?.reply_rate.pct_change} />
                  <KpiCard title="Conversion Rate" value={`${k?.conversion_rate.value ?? 0}%`}
                    icon={Users} iconBg="bg-amber-500" loading={loading} pctChange={k?.conversion_rate.pct_change} />
                </div>
              </SectionCard>
            </div>

            {/* ══ Message analytics ═══════════════════════════════════════════ */}
            <SectionCard icon={MessageSquare} title="Message Analytics" sub="Volume, delivery funnel and daily inbound/outbound trend" color="text-sky-600">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                <StatTile label="Sent" value={m?.sent ?? 0} loading={loading} />
                <StatTile label="Delivered" value={m?.delivered ?? 0} loading={loading} />
                <StatTile label="Read" value={m?.read ?? 0} loading={loading} />
                <StatTile label="Failed" value={m?.failed ?? 0} loading={loading} />
                <StatTile label="Replies" value={m?.replies ?? 0} loading={loading} />
              </div>

              {!loading && data && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <Send className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold tabular-nums">{k?.delivery_rate.value ?? 0}%</p>
                      <p className="text-[10px] text-muted-foreground">Delivery rate</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                      <Eye className="h-4 w-4 text-sky-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold tabular-nums">{k?.read_rate.value ?? 0}%</p>
                      <p className="text-[10px] text-muted-foreground">Read rate</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <MessageCircleReply className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold tabular-nums">{k?.reply_rate.value ?? 0}%</p>
                      <p className="text-[10px] text-muted-foreground">Reply rate</p>
                    </div>
                  </div>
                </div>
              )}

              <Card>
                <CardContent className="pt-4 overflow-x-auto">
                  {loading ? <ChartSkeleton h={56} /> : (m?.daily?.length ?? 0) === 0 ? <Empty /> : (
                    <div className="min-w-[480px]">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={m!.daily} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="cc-gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SKY} stopOpacity={0.2}/><stop offset="95%" stopColor={SKY} stopOpacity={0}/></linearGradient>
                            <linearGradient id="cc-gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={BRAND} stopOpacity={0.2}/><stop offset="95%" stopColor={BRAND} stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={TT} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="inbound" name="Inbound" stroke={SKY} fill="url(#cc-gIn)" strokeWidth={2} dot={false} />
                          <Area type="monotone" dataKey="outbound" name="Outbound" stroke={BRAND} fill="url(#cc-gOut)" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </SectionCard>

            {/* ══ Campaign performance ════════════════════════════════════════ */}
            <SectionCard icon={Megaphone} title="Campaign Performance" sub="Status breakdown and top campaigns by volume" color="text-orange-600">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                <StatTile label="Total" value={c?.total ?? 0} loading={loading} />
                <StatTile label="Active" value={c?.active ?? 0} loading={loading} />
                <StatTile label="Completed" value={c?.completed ?? 0} loading={loading} />
                <StatTile label="Failed" value={c?.failed ?? 0} loading={loading} />
                <StatTile label="Scheduled" value={c?.scheduled ?? 0} loading={loading} />
              </div>

              <Card>
                <CardContent className="pt-4 overflow-x-auto">
                  {loading ? <ChartSkeleton h={56} /> : (c?.top?.length ?? 0) === 0 ? <Empty msg="No campaigns in this period" /> : (
                    <div className="min-w-[480px]">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={c!.top} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0}
                            tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 12)}…` : v)} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={TT} cursor={{ fill: 'hsl(var(--muted))' }} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="sent" name="Sent" fill={BRAND} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="replied" name="Replied" fill={GREEN} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </SectionCard>

            {/* ══ Leads funnel ═════════════════════════════════════════════════ */}
            <SectionCard icon={Target} title="Leads Funnel" sub="Stage breakdown, temperature and conversion for the period" color="text-pink-600">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-2">
                <StatTile label="Total" value={l?.total ?? 0} loading={loading} />
                <StatTile label="Hot" value={l?.hot ?? 0} loading={loading} />
                <StatTile label="Warm" value={l?.warm ?? 0} loading={loading} />
                <StatTile label="Cold" value={l?.cold ?? 0} loading={loading} />
                <StatTile label="Converted" value={l?.converted ?? 0} loading={loading} />
              </div>
              <p className="text-[11px] text-muted-foreground mb-4">
                Temperature is activity-based (derived from recent message volume) — not AI-scored.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <CardContent className="pt-4 overflow-x-auto">
                    {loading ? <ChartSkeleton h={56} /> : (l?.by_stage?.every((s) => s.count === 0) ?? true) ? <Empty msg="No leads in this period" /> : (
                      <div className="min-w-[420px]">
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={l!.by_stage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="stage" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.replace('_', ' ')} />
                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                            <Tooltip contentStyle={TT} cursor={{ fill: 'hsl(var(--muted))' }} />
                            <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                              {l!.by_stage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 flex flex-col items-center justify-center h-full gap-1.5 text-center min-h-[180px]">
                    {loading ? <Skeleton className="h-10 w-20" /> : (
                      <>
                        <p className="text-3xl font-bold tabular-nums text-pink-600">{k?.conversion_rate.value ?? 0}%</p>
                        <p className="text-xs text-muted-foreground">Conversion rate</p>
                        {k?.conversion_rate.pct_change != null && (
                          <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium', k.conversion_rate.pct_change >= 0 ? 'text-green-600' : 'text-red-500')}>
                            {k.conversion_rate.pct_change >= 0 ? '↑' : '↓'} {Math.abs(k.conversion_rate.pct_change)}% vs prior period
                          </span>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </SectionCard>

            {/* ══ Conversations ════════════════════════════════════════════════ */}
            <SectionCard icon={MessageCircle} title="Conversations" sub="Status breakdown and response time for the period" color="text-indigo-600">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatTile label="Total" value={conv?.total ?? 0} loading={loading} />
                <StatTile label="Open" value={conv?.open ?? 0} loading={loading} />
                <StatTile label="Resolved" value={conv?.resolved ?? 0} loading={loading} />
                <StatTile label="Unresolved" value={conv?.unresolved ?? 0} loading={loading} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 flex flex-col items-center justify-center h-full gap-1.5 text-center min-h-[200px]">
                    {loading ? <Skeleton className="h-10 w-20" /> : (
                      <>
                        <Clock className="h-5 w-5 text-indigo-500 mb-1" />
                        <p className="text-3xl font-bold tabular-nums">
                          {conv?.avg_first_response_mins != null ? `${conv.avg_first_response_mins} min` : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">Avg first response time</p>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardContent className="pt-4">
                    {loading ? <ChartSkeleton /> : (conv?.by_status?.length ?? 0) === 0 ? <Empty /> : (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={conv!.by_status} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={40} outerRadius={70} labelLine={false} label={PieLabel}>
                            {conv!.by_status.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={TT} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </SectionCard>

            {/* ══ Bookings & Events ═══════════════════════════════════════════ */}
            <SectionCard icon={CalendarCheck} title="Bookings & Events" sub="Tracked conversion events for the period" color="text-emerald-600">
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-xl" />)}
                </div>
              ) : (ev?.length ?? 0) === 0 ? (
                <Card><CardContent className="py-8"><Empty msg="No booking or conversion events in this period" /></CardContent></Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {ev!.map((e, i) => (
                    <div key={e.type} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${PIE_COLORS[i % PIE_COLORS.length]}22` }}>
                        <CalendarCheck className="h-4 w-4" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xl font-bold tabular-nums">{e.count.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground truncate">{formatEventType(e.type)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}

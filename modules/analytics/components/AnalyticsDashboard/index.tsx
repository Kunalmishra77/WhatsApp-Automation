'use client';

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, FunnelChart, Funnel, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  MessageSquare, ArrowDownLeft, ArrowUpRight, CheckCircle2,
  MessageCircle, UserPlus, Star, Download, Clock, Users, Phone,
  Megaphone, TrendingUp, ThumbsUp, ThumbsDown, Minus,
  Flame, Snowflake, Thermometer, GitBranch, Target,
  Send, Eye, BarChart2, Zap, Award, Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  useAnalyticsOverview, useAgentPerformance, useExtendedAnalytics,
  type AgentStat, type DrawerType,
} from '../../hooks/useAnalytics';
import { AnalyticsDrawer } from '../AnalyticsDrawer';
import { useWorkspaceStore } from '@/store/workspace.store';

// ── Constants ─────────────────────────────────────────────────────────────────
const BRAND = '#6366f1', GREEN = '#10b981', AMBER = '#f59e0b', ROSE = '#ef4444', SKY = '#0ea5e9', VIOLET = '#8b5cf6', GRAY = '#6b7280';
const PIE_COLORS = [BRAND, GREEN, AMBER, ROSE, SKY, VIOLET];
const TT = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 };

type Range = '7d' | '30d' | '90d';
function buildDates(r: Range) {
  const to = new Date().toISOString().split('T')[0]!;
  const days = r === '7d' ? 7 : r === '30d' ? 30 : 90;
  return { from: new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]!, to };
}
function fmtMins(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

// ── Skeletons / Empty ─────────────────────────────────────────────────────────
function ChartSkeleton({ h = 56 }: { h?: number }) {
  return <div className={`h-${h}`}><Skeleton className="w-full h-full rounded-lg" /></div>;
}
function Empty({ msg = 'No data for this period' }: { msg?: string }) {
  return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{msg}</div>;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, iconBg, loading, onClick, trend }: {
  title: string; value: string | number; sub?: string; trend?: { value: number; label: string };
  icon: React.ElementType; iconBg: string; loading: boolean; onClick?: () => void;
}) {
  return (
    <Card
      className={cn('transition-all', onClick && 'cursor-pointer hover:ring-2 hover:ring-brand-400 hover:shadow-md')}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1 truncate">{title}</p>
            {loading
              ? <Skeleton className="h-7 w-16 mb-1" />
              : <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
            }
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
            {trend && !loading && (
              <p className={cn('text-[10px] font-medium mt-1', trend.value >= 0 ? 'text-green-600' : 'text-red-500')}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
              </p>
            )}
            {onClick && !loading && <p className="text-[10px] text-brand-500 mt-1 font-medium">View details →</p>}
          </div>
          <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', iconBg)}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, sub, color = 'text-brand-600' }: {
  icon: React.ElementType; title: string; sub?: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={cn('h-7 w-7 rounded-lg bg-muted flex items-center justify-center')}>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function HourlyHeatmap({ data, loading }: { data: number[][]; loading: boolean }) {
  if (loading) return <ChartSkeleton />;
  const max = Math.max(1, ...data.flatMap((r) => r));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="flex ml-10 mb-1">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="flex-1 text-[9px] text-muted-foreground text-center">{i % 4 === 0 ? `${i}h` : ''}</div>
          ))}
        </div>
        {DAYS.map((day, di) => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-9 text-[10px] text-muted-foreground text-right pr-1 shrink-0">{day}</span>
            {(data[di] ?? []).map((val, hi) => {
              const pct = val / max;
              return (
                <div key={hi} title={`${day} ${hi}:00 — ${val} msgs`} className="flex-1 h-4 rounded-sm"
                  style={{ background: val === 0 ? 'hsl(var(--muted))' : `rgba(99,102,241,${0.15 + pct * 0.85})` }} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pie label ─────────────────────────────────────────────────────────────────
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }) {
  if (percent < 0.05) return null;
  const R = Math.PI / 180, r = innerRadius + (outerRadius - innerRadius) * 0.5;
  return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{`${(percent * 100).toFixed(0)}%`}</text>;
}

// ── Campaign status badge ──────────────────────────────────────────────────────
const CAMP_STATUS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  running:   'bg-blue-100 text-blue-700',
  failed:    'bg-red-100 text-red-700',
  draft:     'bg-gray-100 text-gray-600',
  scheduled: 'bg-amber-100 text-amber-700',
  paused:    'bg-orange-100 text-orange-700',
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function AnalyticsDashboard() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [range, setRange]           = useState<Range>('30d');
  const [drawer, setDrawer]         = useState<DrawerType | null>(null);
  const { from, to }                = buildDates(range);

  const { data: ov,  isLoading: ovL }  = useAnalyticsOverview(from, to);
  const { data: ext, isLoading: extL } = useExtendedAnalytics(from, to);
  const { data: agentData, isLoading: agentL } = useAgentPerformance(from, to);

  const loading  = ovL || extL;
  const s        = ov?.summary;

  const handleExport = (type: string) => {
    window.open(`/api/reports/export?workspaceId=${workspaceId}&type=${type}&from=${from}&to=${to}`, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border bg-card/95 backdrop-blur px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100">
            <BarChart2 className="h-4 w-4 text-brand-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Analytics Powerhouse</h1>
            <p className="text-[11px] text-muted-foreground">Full visibility across messages, campaigns, leads, sentiment & team</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['7d', '30d', '90d'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn('px-3 py-1 text-xs font-medium transition-colors', range === r ? 'bg-brand-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground')}
              >
                {r}
              </button>
            ))}
          </div>
          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => handleExport('conversations')}>Export Conversations</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport('messages')}>Export Messages</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport('contacts')}>Export Contacts</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Scrollable Body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* ══ SECTION 1: KPI Cards ═══════════════════════════════════════════ */}
        <div>
          <SectionHeader icon={Activity} title="Overview" sub="Key metrics for the selected period" color="text-brand-600" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <KpiCard title="Total Messages"   value={s?.totalMessages ?? 0}       icon={MessageSquare} iconBg="bg-brand-500"  loading={ovL} />
            <KpiCard title="Inbound"          value={s?.totalInbound ?? 0}        icon={ArrowDownLeft} iconBg="bg-sky-500"    loading={ovL} onClick={() => setDrawer('inbound')} />
            <KpiCard title="Outbound"         value={s?.totalOutbound ?? 0}       icon={ArrowUpRight}  iconBg="bg-violet-500" loading={ovL} onClick={() => setDrawer('outbound')} />
            <KpiCard title="Delivery Rate"    value={`${s?.deliveryRate ?? 0}%`}  icon={CheckCircle2}  iconBg="bg-green-500"  loading={ovL} onClick={() => setDrawer('delivery')} />
            <KpiCard title="Open Convos"      value={s?.openConversations ?? 0}   icon={MessageCircle} iconBg="bg-amber-500"  loading={ovL} onClick={() => setDrawer('open')} />
            <KpiCard title="Resolved"         value={s?.resolvedConversations ?? 0} icon={CheckCircle2} iconBg="bg-emerald-500" loading={ovL} onClick={() => setDrawer('resolved')} />
            <KpiCard title="Avg Response"     value={s ? fmtMins(s.avgResponseTimeMin) : '—'} icon={Clock} iconBg="bg-rose-500" loading={ovL} sub="first reply time" />
            <KpiCard title="Total Contacts"   value={s?.totalContacts ?? 0}       icon={Users}         iconBg="bg-indigo-500" loading={ovL} />
            <KpiCard title="New Contacts"     value={s?.newContacts ?? 0}         icon={UserPlus}      iconBg="bg-teal-500"   loading={ovL} onClick={() => setDrawer('new-contacts')} />
            <KpiCard title="CSAT Score"       value={s?.csatAvgScore != null ? `${s.csatAvgScore}/5` : '—'} icon={Star} iconBg="bg-yellow-500" loading={ovL} sub={s?.csatResponseCount ? `${s.csatResponseCount} responses` : undefined} onClick={s?.csatResponseCount ? () => setDrawer('csat') : undefined} />
            <KpiCard title="Total Leads"      value={ext?.totalLeads ?? 0}        icon={Target}        iconBg="bg-pink-500"   loading={extL} />
            <KpiCard title="Campaigns Sent"   value={ext?.campaignSummary.totalSent ?? 0} icon={Megaphone} iconBg="bg-orange-500" loading={extL} sub={`${ext?.campaignSummary.completed ?? 0} completed`} />
          </div>
        </div>

        {/* ══ SECTION 2: Message Activity ════════════════════════════════════ */}
        <div>
          <SectionHeader icon={TrendingUp} title="Message Activity" sub="Daily inbound vs outbound + new contacts" color="text-sky-600" />
          <Card>
            <CardContent className="pt-4">
              {ovL ? <ChartSkeleton h={56} /> : (ov?.dailyMessages?.length ?? 0) === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={ov!.dailyMessages} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gIn"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={SKY}   stopOpacity={0.2}/><stop offset="95%" stopColor={SKY}   stopOpacity={0}/></linearGradient>
                      <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={BRAND} stopOpacity={0.2}/><stop offset="95%" stopColor={BRAND} stopOpacity={0}/></linearGradient>
                      <linearGradient id="gCon" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={GREEN} stopOpacity={0.2}/><stop offset="95%" stopColor={GREEN} stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={TT} labelFormatter={(l: string) => fmtDate(l)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="inbound"     name="Inbound"      stroke={SKY}   fill="url(#gIn)"  strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="outbound"    name="Outbound"     stroke={BRAND} fill="url(#gOut)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="newContacts" name="New Contacts" stroke={GREEN} fill="url(#gCon)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ SECTION 3: Campaign Performance ═══════════════════════════════ */}
        <div>
          <SectionHeader icon={Megaphone} title="Campaign Performance" sub="Recent campaigns — delivery, read and reply rates" color="text-orange-600" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Total',     value: ext?.campaignSummary.total ?? 0,     color: 'bg-brand-100 text-brand-700' },
              { label: 'Completed', value: ext?.campaignSummary.completed ?? 0, color: 'bg-green-100 text-green-700' },
              { label: 'Running',   value: ext?.campaignSummary.running ?? 0,   color: 'bg-blue-100 text-blue-700' },
              { label: 'Draft/Sch', value: ext?.campaignSummary.draft ?? 0,     color: 'bg-amber-100 text-amber-700' },
              { label: 'Failed',    value: ext?.campaignSummary.failed ?? 0,    color: 'bg-red-100 text-red-700' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-3 text-center">
                {extL ? <Skeleton className="h-7 w-12 mx-auto mb-1" /> : (
                  <p className="text-2xl font-bold tabular-nums">{item.value}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              {extL ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (ext?.campaignStats?.length ?? 0) === 0 ? <Empty msg="No campaigns yet" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Read Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ext!.campaignStats.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-sm max-w-[180px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">{c.name}</span>
                            {c.abGroup && <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700">A/B {c.abGroup}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono max-w-[120px] truncate">{c.template}</TableCell>
                        <TableCell><span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', CAMP_STATUS[c.status] ?? 'bg-gray-100 text-gray-600')}>{c.status}</span></TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.total.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <Progress value={c.deliveryRate} className="h-1.5 flex-1" />
                            <span className="text-xs w-8 tabular-nums">{c.deliveryRate}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <Progress value={c.readRate} className="h-1.5 flex-1" />
                            <span className="text-xs w-8 tabular-nums">{c.readRate}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Delivery Funnel */}
          {(ext?.deliveryFunnel?.length ?? 0) > 0 && (
            <Card className="mt-3">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Message Delivery Funnel</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {ext!.deliveryFunnel.map((item, i) => {
                    const max = ext!.deliveryFunnel[0]?.count ?? 1;
                    const pct = max > 0 ? Math.round((item.count / max) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs w-20 text-muted-foreground shrink-0">{item.stage}</span>
                        <div className="flex-1 h-5 rounded-md overflow-hidden bg-muted">
                          <div className="h-full rounded-md flex items-center pl-2 transition-all" style={{ width: `${Math.max(pct, 5)}%`, background: item.color }}>
                            <span className="text-[10px] text-white font-semibold">{item.count.toLocaleString()}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ══ SECTION 4: Lead Intelligence ══════════════════════════════════ */}
        <div>
          <SectionHeader icon={Target} title="Lead Intelligence" sub="Lead funnel, temperature distribution and AI scoring" color="text-pink-600" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Lead Funnel */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">Lead Funnel <span className="text-xs font-normal text-muted-foreground">by stage</span></CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {extL ? <ChartSkeleton /> : (ext?.leadFunnel?.every((l) => l.count === 0) ?? true) ? <Empty msg="No leads in this period" /> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={ext!.leadFunnel} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={70} tickFormatter={(v: string) => v.replace('_', ' ')} />
                      <Tooltip contentStyle={TT} />
                      <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
                        {ext!.leadFunnel.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Lead Temperature Pie */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Lead Temperature</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {extL ? <ChartSkeleton /> : (
                  <div className="space-y-3">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={ext?.leadTemperature ?? []} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} labelLine={false} label={PieLabel}>
                          {(ext?.leadTemperature ?? []).map((item, i) => <Cell key={i} fill={item.color} />)}
                        </Pie>
                        <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [v, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5">
                      {(ext?.leadTemperature ?? []).map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="text-muted-foreground">{item.label}</span>
                          </div>
                          <span className="font-semibold tabular-nums">{item.value}</span>
                        </div>
                      ))}
                    </div>
                    {ext?.avgAiScore != null && (
                      <div className="rounded-lg bg-muted/50 px-3 py-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3 text-amber-500" />Avg AI Score</span>
                        <span className="text-sm font-bold">{ext.avgAiScore}/100</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ══ SECTION 5: Sentiment Analysis ═════════════════════════════════ */}
        <div>
          <SectionHeader icon={ThumbsUp} title="Sentiment Analysis" sub="Customer sentiment across all conversations" color="text-teal-600" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sentiment Trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Sentiment Trend</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {extL ? <ChartSkeleton /> : (ext?.sentimentTrend?.length ?? 0) === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={ext!.sentimentTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GREEN} stopOpacity={0.3}/><stop offset="95%" stopColor={GREEN} stopOpacity={0}/></linearGradient>
                        <linearGradient id="gNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ROSE}  stopOpacity={0.3}/><stop offset="95%" stopColor={ROSE}  stopOpacity={0}/></linearGradient>
                        <linearGradient id="gNeu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GRAY}  stopOpacity={0.2}/><stop offset="95%" stopColor={GRAY}  stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={TT} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="positive" name="Positive" stroke={GREEN} fill="url(#gPos)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="neutral"  name="Neutral"  stroke={GRAY}  fill="url(#gNeu)" strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="negative" name="Negative" stroke={ROSE}  fill="url(#gNeg)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Sentiment + Contact Temp breakdown */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm">Conversation Sentiment</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {extL ? <ChartSkeleton h={24} /> : (ext?.sentimentBreakdown ?? []).map((item) => {
                    const total = (ext?.sentimentBreakdown ?? []).reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    const icons: Record<string, React.ReactNode> = {
                      Positive: <ThumbsUp className="h-3 w-3" />,
                      Neutral:  <Minus className="h-3 w-3" />,
                      Negative: <ThumbsDown className="h-3 w-3" />,
                    };
                    return (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="shrink-0" style={{ color: item.color }}>{icons[item.label]}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                        <span className="text-xs font-medium w-8 tabular-nums">{item.value}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm">Contact Temperature</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {extL ? <ChartSkeleton h={24} /> : (ext?.contactTemperatureBreakdown ?? []).map((item) => {
                    const total = (ext?.contactTemperatureBreakdown ?? []).reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    const icons: Record<string, React.ReactNode> = {
                      Hot:  <Flame className="h-3 w-3" />,
                      Warm: <Thermometer className="h-3 w-3" />,
                      Cold: <Snowflake className="h-3 w-3" />,
                    };
                    return (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="shrink-0" style={{ color: item.color }}>{icons[item.label]}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                        <span className="text-xs font-medium w-8 tabular-nums">{item.value}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* ══ SECTION 6: Conversations & Resolution ═════════════════════════ */}
        <div>
          <SectionHeader icon={MessageCircle} title="Conversations" sub="Status breakdown, resolution time and activity heatmap" color="text-indigo-600" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Conversation status */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">By Status</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                {ovL ? <ChartSkeleton /> : (ov?.conversationsByStatus?.length ?? 0) === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ov!.conversationsByStatus} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={TT} cursor={{ fill: 'hsl(var(--muted))' }} />
                      <Bar dataKey="count" name="Conversations" radius={[4, 4, 0, 0]} onClick={(d) => setDrawer(d.status as DrawerType)}>
                        {ov!.conversationsByStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="cursor-pointer" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Resolution time */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Resolution Time</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                {ovL ? <ChartSkeleton /> : (ov?.resolutionTimeDistribution?.length ?? 0) === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ov!.resolutionTimeDistribution} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={TT} />
                      <Bar dataKey="count" name="Conversations" fill={BRAND} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Message sender breakdown */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Message Sources</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                {ovL ? <ChartSkeleton /> : (ov?.senderBreakdown?.length ?? 0) === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={ov!.senderBreakdown} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={70} labelLine={false} label={PieLabel}>
                        {ov!.senderBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TT} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Heatmap */}
          <Card className="mt-4">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Peak Activity Heatmap <span className="font-normal text-muted-foreground text-xs">— inbound messages by day × hour</span></CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <HourlyHeatmap data={ov?.hourlyHeatmap ?? []} loading={ovL} />
            </CardContent>
          </Card>
        </div>

        {/* ══ SECTION 7: Flow Performance ═══════════════════════════════════ */}
        <div>
          <SectionHeader icon={GitBranch} title="Flow Builder Performance" sub="Execution stats for all chatbot flows" color="text-violet-600" />
          <Card>
            <CardContent className="p-0">
              {extL ? (
                <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (ext?.flowStats?.length ?? 0) === 0 ? <Empty msg="No flows created yet" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flow Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Nodes</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead>Completion Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ext!.flowStats.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium text-sm">{f.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={f.isActive ? 'text-emerald-600 border-emerald-300' : 'text-gray-500'}>
                            {f.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{f.nodeCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.sessions}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.completed}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <Progress value={f.completionRate} className="h-1.5 flex-1" />
                            <span className="text-xs w-8 tabular-nums">{f.completionRate}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ SECTION 8: Team Performance ═══════════════════════════════════ */}
        <div>
          <SectionHeader icon={Award} title="Team Performance" sub="Agent metrics — response time, resolved conversations, CSAT" color="text-amber-600" />
          <Card>
            <CardContent className="p-0">
              {agentL ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (agentData?.agents?.length ?? 0) === 0 ? <Empty msg="No agent activity in this period" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Msgs Sent</TableHead>
                      <TableHead className="text-right">Assigned</TableHead>
                      <TableHead className="text-right">Resolved</TableHead>
                      <TableHead className="text-right">Avg Response</TableHead>
                      <TableHead className="text-right">CSAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(agentData?.agents ?? []).map((a: AgentStat) => (
                      <TableRow key={a.agentId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-brand-700">{a.name.slice(0, 2).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">{a.name}</p>
                              <p className="text-[10px] text-muted-foreground">{a.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.messagesSent}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.totalAssigned}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="text-green-600 font-medium">{a.resolved}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.avgFirstResponseMin > 0 ? fmtMins(a.avgFirstResponseMin) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {a.csatAvgScore != null ? (
                            <span className={cn('font-semibold tabular-nums', a.csatAvgScore >= 4 ? 'text-green-600' : a.csatAvgScore >= 3 ? 'text-amber-600' : 'text-red-500')}>
                              {a.csatAvgScore}/5
                            </span>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ SECTION 9: Top Contacts + Tag Distribution ════════════════════ */}
        <div>
          <SectionHeader icon={Users} title="Contacts & Tags" sub="Most active contacts and tag distribution" color="text-sky-600" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top contacts */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Top Active Contacts</CardTitle></CardHeader>
              <CardContent className="p-0">
                {ovL ? (
                  <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                ) : (ov?.topContacts?.length ?? 0) === 0 ? <Empty /> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Messages</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(ov?.topContacts ?? []).slice(0, 8).map((c, i) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-bold text-muted-foreground">{i + 1}</div>
                              <span className="text-sm font-medium truncate">{c.name ?? 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{c.phone}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="tabular-nums">{c.messageCount}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Tag distribution */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Tag Distribution</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                {ovL ? <ChartSkeleton /> : (ov?.tagDistribution?.length ?? 0) === 0 ? <Empty msg="No tags assigned yet" /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={ov!.tagDistribution.slice(0, 10)} layout="vertical" margin={{ left: 5, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="tag" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip contentStyle={TT} />
                      <Bar dataKey="count" name="Contacts" fill={SKY} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      </div>{/* end scrollable body */}

      {/* ── Detail Drawer ──────────────────────────────────────────────────── */}
      <AnalyticsDrawer
        open={!!drawer}
        type={drawer}
        from={from}
        to={to}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}

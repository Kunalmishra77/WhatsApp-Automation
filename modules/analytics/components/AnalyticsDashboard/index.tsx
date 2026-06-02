'use client';

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  MessageSquare, ArrowDownLeft, ArrowUpRight, CheckCircle2,
  MessageCircle, UserPlus, Star, Download, Clock, Users, Phone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  useAnalyticsOverview, useAgentPerformance,
  type AgentStat, type DrawerType,
} from '../../hooks/useAnalytics';
import { AnalyticsDrawer } from '../AnalyticsDrawer';
import { useWorkspaceStore } from '@/store/workspace.store';

const BRAND = '#6366f1', GREEN = '#10b981', AMBER = '#f59e0b', ROSE = '#f43f5e', SKY = '#0ea5e9', VIOLET = '#8b5cf6';
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
  const h = Math.floor(m / 60); const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}
function ChartSkeleton() { return <div className="h-56"><Skeleton className="w-full h-full rounded-lg" /></div>; }
function Empty({ msg = 'No data for this period' }: { msg?: string }) {
  return <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">{msg}</div>;
}
function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }) {
  if (percent < 0.05) return null;
  const R = Math.PI / 180, r = innerRadius + (outerRadius - innerRadius) * 0.5;
  return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>{`${(percent * 100).toFixed(0)}%`}</text>;
}

// ── Summary card ───────────────────────────────────────────────────────────────
function SummaryCard({ title, value, sub, icon: Icon, iconBg, loading, onClick }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; iconBg: string; loading: boolean; onClick?: () => void;
}) {
  return (
    <Card className={cn('transition-all', onClick && 'cursor-pointer hover:ring-2 hover:ring-brand-400 hover:shadow-md')} onClick={onClick}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            {loading ? <Skeleton className="h-7 w-20 mb-1" /> : <p className="text-2xl font-bold leading-tight">{value}</p>}
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
            {onClick && !loading && <p className="text-[10px] text-brand-500 mt-1 font-medium">View details →</p>}
          </div>
          <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0', iconBg)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Heatmap ────────────────────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function HourlyHeatmap({ data, loading }: { data: number[][]; loading: boolean }) {
  if (loading) return <ChartSkeleton />;
  const max = Math.max(1, ...data.flatMap((r) => r));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
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
        <div className="flex ml-10 mt-2 items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Less</span>
          {[0.1,0.3,0.5,0.75,1].map((v) => <div key={v} className="h-3 w-4 rounded-sm" style={{ background: `rgba(99,102,241,${0.15 + v * 0.85})` }} />)}
          <span className="text-[10px] text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}

// ── Agent table ────────────────────────────────────────────────────────────────
function AgentTable({ agents, loading }: { agents: AgentStat[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Team Performance</CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : agents.length === 0 ? <Empty msg="No agents found" />
          : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Messages Sent</TableHead>
                    <TableHead className="text-right">Assigned</TableHead>
                    <TableHead className="text-right">Resolved</TableHead>
                    <TableHead className="text-right">Avg Response</TableHead>
                    <TableHead className="text-right">CSAT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((a) => (
                    <TableRow key={a.agentId}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-brand-700">{a.name.split(' ').map((n) => n[0] ?? '').join('').slice(0,2).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{a.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right"><span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{a.messagesSent.toLocaleString()}</span></TableCell>
                      <TableCell className="text-right text-sm">{a.totalAssigned.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm"><span className="inline-flex items-center gap-1">{a.resolved > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}{a.resolved.toLocaleString()}</span></TableCell>
                      <TableCell className="text-right text-sm">{a.avgFirstResponseMin > 0 ? fmtMins(a.avgFirstResponseMin) : '—'}</TableCell>
                      <TableCell className="text-right text-sm">{a.csatAvgScore != null ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />{a.csatAvgScore}</span> : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function AnalyticsDashboard() {
  const [range, setRange]   = useState<Range>('30d');
  const [drawer, setDrawer] = useState<DrawerType | null>(null);
  const { from, to }        = buildDates(range);
  const workspaceId         = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const { data, isLoading, isError } = useAnalyticsOverview(from, to);
  const { data: agentData, isLoading: agentsLoading } = useAgentPerformance(from, to);

  const summary    = data?.summary;
  const daily      = data?.dailyMessages         ?? [];
  const senders    = data?.senderBreakdown       ?? [];
  const contacts   = data?.topContacts           ?? [];
  const statuses   = data?.conversationsByStatus ?? [];
  const resDist    = data?.resolutionTimeDistribution ?? [];
  const tags       = data?.tagDistribution       ?? [];
  const heatmap    = data?.hourlyHeatmap         ?? Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);

  const handleExport = (type: string) => {
    if (!workspaceId) return;
    const a = document.createElement('a');
    a.href = `/api/reports/export?workspaceId=${workspaceId}&type=${type}&from=${from}&to=${to}`;
    a.download = `${type}-${from}-${to}.csv`;
    a.click();
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{{ '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' }[range]} · {from} → {to}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {(['7d','30d','90d'] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {r}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('conversations')}>Conversations (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('messages')}>Messages (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('contacts')}>Contacts (CSV)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isError && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">Failed to load analytics. Please try again.</div>}

      {/* ── Summary cards (clickable) ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard title="Total Messages"  value={(summary?.totalMessages ?? 0).toLocaleString()}         sub="all messages"           icon={MessageSquare} iconBg="bg-[#6366f1]" loading={isLoading} />
        <SummaryCard title="Inbound"         value={(summary?.totalInbound  ?? 0).toLocaleString()}         sub="from contacts"          icon={ArrowDownLeft} iconBg="bg-[#10b981]" loading={isLoading} onClick={() => setDrawer('inbound')} />
        <SummaryCard title="Outbound"        value={(summary?.totalOutbound ?? 0).toLocaleString()}         sub="by agents / bots"       icon={ArrowUpRight}  iconBg="bg-[#0ea5e9]" loading={isLoading} onClick={() => setDrawer('outbound')} />
        <SummaryCard title="Delivery Rate"   value={`${summary?.deliveryRate ?? 0}%`}                       sub="delivered or read"      icon={CheckCircle2}  iconBg="bg-[#f59e0b]" loading={isLoading} onClick={() => setDrawer('delivery')} />
        <SummaryCard title="Avg Response"    value={summary?.avgResponseTimeMin ? fmtMins(summary.avgResponseTimeMin) : '—'} sub="first reply time" icon={Clock} iconBg="bg-[#8b5cf6]" loading={isLoading} />
        <SummaryCard title="Open Convos"     value={(summary?.openConversations ?? 0).toLocaleString()}     sub="currently active"       icon={MessageCircle} iconBg="bg-[#f43f5e]" loading={isLoading} onClick={() => setDrawer('open')} />
        <SummaryCard title="Resolved"        value={(summary?.resolvedConversations ?? 0).toLocaleString()} sub="all time"               icon={CheckCircle2}  iconBg="bg-[#10b981]" loading={isLoading} onClick={() => setDrawer('resolved')} />
        <SummaryCard title="New Contacts"    value={(summary?.newContacts ?? 0).toLocaleString()}           sub={`of ${(summary?.totalContacts ?? 0).toLocaleString()} total`} icon={UserPlus} iconBg="bg-[#f59e0b]" loading={isLoading} onClick={() => setDrawer('new-contacts')} />
        <SummaryCard title="Total Contacts"  value={(summary?.totalContacts ?? 0).toLocaleString()}         sub="in workspace"           icon={Users}         iconBg="bg-[#6366f1]" loading={isLoading} />
        <SummaryCard title="Avg CSAT"
          value={summary?.csatAvgScore != null ? `${summary.csatAvgScore} / 5` : '—'}
          sub={summary?.csatResponseCount ? `${summary.csatResponseCount} response${summary.csatResponseCount !== 1 ? 's' : ''}` : 'No responses yet'}
          icon={Star} iconBg="bg-[#f59e0b]" loading={isLoading}
          onClick={summary?.csatResponseCount ? () => setDrawer('csat') : undefined}
        />
      </div>

      {/* ── Daily activity + Message sources ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Activity</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton /> : daily.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={224}>
                <LineChart data={daily} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip contentStyle={TT} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="inbound"     stroke={GREEN}  strokeWidth={2} dot={false} name="Inbound" />
                  <Line type="monotone" dataKey="outbound"    stroke={BRAND}  strokeWidth={2} dot={false} name="Outbound" />
                  <Line type="monotone" dataKey="delivered"   stroke={AMBER}  strokeWidth={2} dot={false} strokeDasharray="4 2" name="Delivered" />
                  <Line type="monotone" dataKey="newContacts" stroke={VIOLET} strokeWidth={2} dot={false} strokeDasharray="2 2" name="New Contacts" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Message Sources</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton /> : senders.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie data={senders} dataKey="count" nameKey="type" cx="50%" cy="50%" innerRadius={52} outerRadius={84} paddingAngle={3} labelLine={false} label={renderPieLabel as unknown as boolean}>
                    {senders.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]!} />)}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [v.toLocaleString(), n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Conversations by status (clickable bars) + Resolution time ─────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Conversations by Status</CardTitle>
            <p className="text-[11px] text-muted-foreground">Click a bar to see conversations</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton /> : statuses.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={statuses} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => [v.toLocaleString(), 'Conversations']} />
                  <Bar dataKey="count" radius={[6,6,0,0]} name="Conversations" onClick={(d: { status: string }) => {
                    if (['open','resolved','pending','assigned'].includes(d.status)) setDrawer(d.status as DrawerType);
                  }}>
                    {statuses.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]!} className="cursor-pointer" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Resolution Time Distribution</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton /> : resDist.every((r) => r.count === 0) ? <Empty msg="No resolved conversations yet" /> : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={resDist} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => [v.toLocaleString(), 'Conversations']} />
                  <Bar dataKey="count" radius={[6,6,0,0]}>
                    {resDist.map((_, i) => <Cell key={i} fill={[GREEN, BRAND, AMBER, ROSE][i % 4]!} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Heatmap ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Inbound Activity Heatmap</CardTitle>
          <p className="text-xs text-muted-foreground">Peak hours by day of week — darker = more messages</p>
        </CardHeader>
        <CardContent><HourlyHeatmap data={heatmap} loading={isLoading} /></CardContent>
      </Card>

      {/* ── Tag distribution + Top contacts ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Contact Tag Distribution</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <ChartSkeleton /> : tags.length === 0 ? <Empty msg="No tags assigned to contacts" /> : (
              <ResponsiveContainer width="100%" height={Math.max(180, tags.length * 28)}>
                <BarChart data={tags} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="tag" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => [v.toLocaleString(), 'Contacts']} />
                  <Bar dataKey="count" radius={[0,6,6,0]} fill={BRAND} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top 10 Active Contacts</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
              : contacts.length === 0 ? <Empty msg="No activity in this period" />
              : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Phone</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Messages</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {contacts.map((c, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-4 font-medium max-w-[120px] truncate">{c.name ?? <span className="italic text-muted-foreground">Unknown</span>}</td>
                        <td className="py-2 pr-4 text-muted-foreground font-mono text-xs"><span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span></td>
                        <td className="py-2 text-right"><span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{c.messageCount.toLocaleString()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </CardContent>
        </Card>
      </div>

      {/* ── Team performance ─────────────────────────────────────────────────── */}
      <AgentTable agents={agentData?.agents ?? []} loading={agentsLoading} />

      <AnalyticsDrawer type={drawer} from={from} to={to} open={!!drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

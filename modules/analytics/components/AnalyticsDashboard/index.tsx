'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  MessageCircle,
  UserPlus,
  Star,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAnalyticsOverview } from '../../hooks/useAnalytics';

// ── Brand colours ─────────────────────────────────────────────────────────────
const BRAND   = '#6366f1';
const GREEN   = '#10b981';
const AMBER   = '#f59e0b';
const ROSE    = '#f43f5e';
const SKY     = '#0ea5e9';
const VIOLET  = '#8b5cf6';

const PIE_COLORS = [BRAND, GREEN, AMBER, ROSE, SKY, VIOLET];

// ── Date range helpers ─────────────────────────────────────────────────────────
type Range = '7d' | '30d' | '90d';

function buildDates(range: Range): { from: string; to: string } {
  const to   = new Date().toISOString().split('T')[0]!;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]!;
  return { from, to };
}

// ── Tooltip style ─────────────────────────────────────────────────────────────
const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
};

// ── Summary card ──────────────────────────────────────────────────────────────
interface SummaryCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  loading: boolean;
}

function SummaryCard({ title, value, sub, icon: Icon, iconBg, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            {sub && (
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            )}
          </div>
          <div
            className={cn(
              'h-12 w-12 rounded-full flex items-center justify-center shrink-0',
              iconBg,
            )}
          >
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart skeleton ────────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="flex items-center justify-center h-56">
      <Skeleton className="w-full h-full rounded-lg" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyChart({ message = 'No data for this period' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ── Custom donut label ─────────────────────────────────────────────────────────
interface PieLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: PieLabelProps) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export function AnalyticsDashboard() {
  const [range, setRange] = useState<Range>('30d');
  const { from, to } = buildDates(range);

  const { data, isLoading, isError } = useAnalyticsOverview(from, to);

  const summary            = data?.summary;
  const dailyMessages      = data?.dailyMessages      ?? [];
  const senderBreakdown    = data?.senderBreakdown    ?? [];
  const topContacts        = data?.topContacts        ?? [];
  const conversationsByStatus = data?.conversationsByStatus ?? [];

  const rangeLabels: Record<Range, string> = {
    '7d':  'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rangeLabels[range]} · {from} → {to}
          </p>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                range === r
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load analytics data. Please try again.
        </div>
      )}

      {/* ── Row 1 — Summary cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard
          title="Total Messages"
          value={summary?.totalMessages.toLocaleString() ?? 0}
          sub="in selected period"
          icon={MessageSquare}
          iconBg="bg-[#6366f1]"
          loading={isLoading}
        />
        <SummaryCard
          title="Inbound"
          value={summary?.totalInbound.toLocaleString() ?? 0}
          sub="received from contacts"
          icon={ArrowDownLeft}
          iconBg="bg-[#10b981]"
          loading={isLoading}
        />
        <SummaryCard
          title="Outbound"
          value={summary?.totalOutbound.toLocaleString() ?? 0}
          sub="sent by agents / bots"
          icon={ArrowUpRight}
          iconBg="bg-[#0ea5e9]"
          loading={isLoading}
        />
        <SummaryCard
          title="Delivery Rate"
          value={`${summary?.deliveryRate ?? 0}%`}
          sub="delivered or read"
          icon={CheckCircle2}
          iconBg="bg-[#f59e0b]"
          loading={isLoading}
        />
        <SummaryCard
          title="Open Conversations"
          value={summary?.openConversations.toLocaleString() ?? 0}
          sub="currently active"
          icon={MessageCircle}
          iconBg="bg-[#f43f5e]"
          loading={isLoading}
        />
        <SummaryCard
          title="New Contacts"
          value={summary?.newContacts.toLocaleString() ?? 0}
          sub={`of ${summary?.totalContacts.toLocaleString() ?? 0} total`}
          icon={UserPlus}
          iconBg="bg-[#8b5cf6]"
          loading={isLoading}
        />
        <SummaryCard
          title="Avg CSAT Score"
          value={
            summary?.csatAvgScore != null
              ? `${summary.csatAvgScore} / 5`
              : '—'
          }
          sub={
            summary?.csatResponseCount != null && summary.csatResponseCount > 0
              ? `${summary.csatResponseCount} response${summary.csatResponseCount === 1 ? '' : 's'}`
              : 'No responses yet'
          }
          icon={Star}
          iconBg="bg-[#f59e0b]"
          loading={isLoading}
        />
      </div>

      {/* ── Row 2 — Charts ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Line chart — Daily Messages */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Daily Messages</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : dailyMessages.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <LineChart data={dailyMessages} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="inbound"
                    stroke={GREEN}
                    strokeWidth={2}
                    dot={false}
                    name="Inbound"
                  />
                  <Line
                    type="monotone"
                    dataKey="outbound"
                    stroke={BRAND}
                    strokeWidth={2}
                    dot={false}
                    name="Outbound"
                  />
                  <Line
                    type="monotone"
                    dataKey="delivered"
                    stroke={AMBER}
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 2"
                    name="Delivered"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie/Donut chart — Message Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Message Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : senderBreakdown.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie
                    data={senderBreakdown}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={3}
                    labelLine={false}
                    label={renderCustomLabel as unknown as boolean}
                  >
                    {senderBreakdown.map((_entry, index) => (
                      <Cell
                        key={index}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) =>
                      value.charAt(0).toUpperCase() + value.slice(1)
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3 — Tables ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bar chart — Conversations by Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Conversations by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton />
            ) : conversationsByStatus.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart
                  data={conversationsByStatus}
                  margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                  barCategoryGap="40%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [value.toLocaleString(), 'Conversations']}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Conversations">
                    {conversationsByStatus.map((_entry, index) => (
                      <Cell
                        key={index}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Table — Top 5 Most Active Contacts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top 5 Most Active Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : topContacts.length === 0 ? (
              <EmptyChart message="No contact activity in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Phone</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Messages
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topContacts.map((contact, index) => (
                      <tr key={index} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-foreground max-w-[120px] truncate">
                          {contact.name ?? (
                            <span className="text-muted-foreground italic">Unknown</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">
                          {contact.phone}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="inline-flex items-center justify-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700 min-w-[2rem]">
                            {contact.messageCount.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

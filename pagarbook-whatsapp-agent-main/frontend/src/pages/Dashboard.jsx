import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import StatCard from '../components/ui/StatCard'
import { useAuthStore } from '../store/auth'
import api from '../api/client'

function useStats(clientId) {
  return useQuery({
    queryKey: ['stats', clientId],
    queryFn: () => api.get(`/stats?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
    refetchInterval: 60_000,
  })
}

function useAnalytics(clientId) {
  return useQuery({
    queryKey: ['analytics', clientId],
    queryFn: () => api.get(`/analytics?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
    refetchInterval: 60_000,
  })
}

const LEAD_COLORS = { Hot: '#ef4444', Warm: '#f59e0b', Cold: '#06b6d4' }

export default function Dashboard() {
  const { clientId } = useAuthStore()
  const { data: stats, isLoading: statsLoading } = useStats(clientId)
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(clientId)

  if (!clientId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">👈</p>
          <p className="font-semibold" style={{ color: '#1a1d2e' }}>Select a client from the sidebar</p>
          <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>Data will load automatically</p>
        </div>
      </div>
    )
  }

  const loading = statsLoading || analyticsLoading

  const leadData = stats ? [
    { name: 'Hot',  value: stats.hotLeads  ?? 0 },
    { name: 'Warm', value: stats.warmLeads ?? 0 },
    { name: 'Cold', value: stats.coldLeads ?? 0 },
  ] : []

  const trendData = (analytics?.trend ?? []).map(d => ({
    date: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    messages: Number(d.count),
  }))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black" style={{ color: '#1a1d2e' }}>Dashboard</h2>
          <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>Live overview of your WhatsApp platform</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(16,185,129,.1)', color: '#10b981' }}>
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#10b981' }}></span>
          Uptime: {stats?.uptime ?? '—'}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: '#9ca3af' }}>
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: '#e8eaf0', borderTopColor: '#6366f1' }}></div>
          Loading stats…
        </div>
      )}

      {/* KPI Row 1 */}
      <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Total Conversations" value={stats?.totalConversations} sub="All time"          icon="💬" />
        <StatCard label="Active Chats"         value={stats?.activeChats}        sub="Right now"         color="#10b981" icon="🟢" />
        <StatCard label="Paused Chats"         value={stats?.pausedChats}         sub="Human takeover"   color="#f59e0b" icon="⏸️" />
        <StatCard label="Human Interventions"  value={stats?.humanInterventions}  sub="Escalated"        color="#ef4444" icon="🙋" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid gap-5 mb-8" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Campaigns"       value={stats?.totalCampaigns}  sub="Total created"   icon="📣" />
        <StatCard label="Delivery Rate"   value={stats?.deliveryRate}    sub="Campaign success" color="#10b981" icon="✅" />
        <StatCard label="Flows"           value={analytics?.flows}       sub="Active flows"     icon="🔀" />
        <StatCard label="Knowledge Base"  value={stats?.totalDocuments}  sub="Documents"        icon="📚" />
      </div>

      {/* Charts */}
      <div className="grid gap-6 mb-6" style={{ gridTemplateColumns: '2fr 1fr' }}>

        {/* Message Trend */}
        <div className="bg-white rounded-2xl p-6"
          style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color: '#1a1d2e' }}>
            Message Volume — Last 7 Days
          </h3>
          <p className="text-xs mb-5" style={{ color: '#9ca3af' }}>
            Total messages: <strong style={{ color: '#1a1d2e' }}>{analytics?.total_messages ?? 0}</strong>
            &nbsp;·&nbsp;
            Failed: <strong style={{ color: '#ef4444' }}>{analytics?.failed_messages ?? 0}</strong>
          </p>

          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm rounded-xl"
              style={{ color: '#d1d5db', background: '#f8faff' }}>
              No message data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e8eaf0', fontSize: 12 }}
                  labelStyle={{ fontWeight: 700 }}
                />
                <Line
                  type="monotone"
                  dataKey="messages"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ fill: '#6366f1', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Lead Breakdown */}
        <div className="bg-white rounded-2xl p-6"
          style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color: '#1a1d2e' }}>Lead Distribution</h3>
          <p className="text-xs mb-5" style={{ color: '#9ca3af' }}>By temperature category</p>

          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={leadData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e8eaf0', fontSize: 12 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {leadData.map((entry) => (
                  <Cell key={entry.name} fill={LEAD_COLORS[entry.name]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="flex gap-4 mt-4 justify-center">
            {leadData.map(({ name, value }) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ background: LEAD_COLORS[name] }}></span>
                <span className="text-xs font-semibold" style={{ color: '#6b7280' }}>
                  {name}: {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard label="Total Messages"  value={analytics?.total_messages}  sub="All conversations" icon="📨" />
        <StatCard label="Failed Messages" value={analytics?.failed_messages} sub="Campaign failures"  color="#ef4444" icon="❌" />
        <StatCard label="Deals Created"   value={analytics?.deals}           sub="In pipelines"       color="#06b6d4" icon="🤝" />
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import StatCard from '../components/ui/StatCard'
import { useAuthStore } from '../store/auth'
import api from '../api/client'

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4']

export default function Analytics() {
  const { clientId } = useAuthStore()

  const { data: stats } = useQuery({
    queryKey: ['stats', clientId],
    queryFn: () => api.get(`/stats?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId, refetchInterval: 60_000,
  })
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', clientId],
    queryFn: () => api.get(`/analytics?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId, refetchInterval: 60_000,
  })

  if (!clientId) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center"><p className="text-4xl mb-3">👈</p><p className="font-semibold" style={{ color:'#1a1d2e' }}>Select a client from the sidebar</p></div>
    </div>
  )

  const trendData = (analytics?.trend || []).map(d => ({
    date: new Date(d.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}),
    messages: Number(d.count),
  }))

  const leadData = stats ? [
    { name:'Hot',  value: stats.hotLeads  || 0 },
    { name:'Warm', value: stats.warmLeads || 0 },
    { name:'Cold', value: stats.coldLeads || 0 },
  ] : []

  const convData = stats ? [
    { name:'Active',  value: stats.activeChats     || 0 },
    { name:'Paused',  value: stats.pausedChats      || 0 },
    { name:'Human',   value: stats.humanInterventions || 0 },
  ] : []

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Analytics</h2>
        <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>Platform performance overview</p>
      </div>

      {/* Top KPIs */}
      <div className="grid gap-5 mb-8" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <StatCard label="Total Messages"  value={analytics?.total_messages}  sub="All time"          icon="📨" />
        <StatCard label="Total Sessions"  value={analytics?.total_sessions}  sub="Conversations"     icon="💬" />
        <StatCard label="Failed Messages" value={analytics?.failed_messages} sub="Delivery failures" color="#ef4444" icon="❌" />
        <StatCard label="Delivery Rate"   value={stats?.deliveryRate}        sub="Campaign success"  color="#10b981" icon="✅" />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 mb-6" style={{ gridTemplateColumns:'2fr 1fr' }}>
        <div className="bg-white rounded-2xl p-6" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color:'#1a1d2e' }}>Message Volume — Last 7 Days</h3>
          <p className="text-xs mb-5" style={{ color:'#9ca3af' }}>Daily inbound + outbound messages</p>
          {trendData.length === 0
            ? <div className="flex items-center justify-center h-44 rounded-xl text-sm" style={{ color:'#d1d5db', background:'#f8faff' }}>No data yet</div>
            : <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top:4, right:12, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                  <XAxis dataKey="date" tick={{ fontSize:11, fill:'#9ca3af' }} />
                  <YAxis tick={{ fontSize:11, fill:'#9ca3af' }} />
                  <Tooltip contentStyle={{ borderRadius:10, border:'1px solid #e8eaf0', fontSize:12 }} />
                  <Line type="monotone" dataKey="messages" stroke="#6366f1" strokeWidth={2.5} dot={{ fill:'#6366f1', r:4 }} activeDot={{ r:6 }} />
                </LineChart>
              </ResponsiveContainer>
          }
        </div>

        <div className="bg-white rounded-2xl p-6" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color:'#1a1d2e' }}>Lead Distribution</h3>
          <p className="text-xs mb-4" style={{ color:'#9ca3af' }}>Hot / Warm / Cold breakdown</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={leadData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                {leadData.map((_, i) => <Cell key={i} fill={['#ef4444','#f59e0b','#06b6d4'][i]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius:10, border:'1px solid #e8eaf0', fontSize:12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-6" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <div className="bg-white rounded-2xl p-6" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color:'#1a1d2e' }}>Conversation Status</h3>
          <p className="text-xs mb-5" style={{ color:'#9ca3af' }}>Active vs Paused vs Human</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={convData} margin={{ top:4, right:8, left:-20, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
              <XAxis dataKey="name" tick={{ fontSize:12, fill:'#6b7280' }} />
              <YAxis tick={{ fontSize:11, fill:'#9ca3af' }} />
              <Tooltip contentStyle={{ borderRadius:10, border:'1px solid #e8eaf0', fontSize:12 }} />
              <Bar dataKey="value" radius={[6,6,0,0]}>
                {convData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-4" style={{ color:'#1a1d2e' }}>Platform Summary</h3>
          {[
            { label:'Total Campaigns',   value: stats?.totalCampaigns,        icon:'📣' },
            { label:'Total Flows',        value: analytics?.flows,             icon:'🔀' },
            { label:'Total Deals',        value: analytics?.deals,             icon:'🤝' },
            { label:'Knowledge Base Docs',value: stats?.totalDocuments,        icon:'📚' },
            { label:'Uptime',             value: stats?.uptime,                icon:'⏱️' },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between py-2.5" style={{ borderBottom:'1px solid #f0f2f8' }}>
              <span className="text-sm" style={{ color:'#6b7280' }}>{r.icon} {r.label}</span>
              <span className="text-sm font-bold" style={{ color:'#1a1d2e' }}>{r.value ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

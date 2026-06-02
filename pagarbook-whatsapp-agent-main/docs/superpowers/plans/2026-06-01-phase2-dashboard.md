# Phase 2: Dashboard Page

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Build a fully working Dashboard page that loads real stats from `/api/stats` and `/api/analytics`, shows KPI cards, a message trend chart, and lead category breakdown.

**Architecture:** React page using TanStack Query to fetch from existing backend endpoints. Install Recharts for charts. No backend changes needed — all APIs already exist.

**Tech Stack:** React, TanStack Query, Recharts, existing `/api/stats` and `/api/analytics` endpoints

---

## Existing API Endpoints (no changes needed)

`GET /api/stats?client_id=X` returns:
```json
{
  "totalDocuments": 5,
  "totalConversations": 120,
  "activeChats": 8,
  "pausedChats": 3,
  "totalCampaigns": 4,
  "hotLeads": 12,
  "warmLeads": 25,
  "coldLeads": 40,
  "humanInterventions": 6,
  "deliveryRate": "94%",
  "uptime": "12h 30m"
}
```

`GET /api/analytics?client_id=X` returns:
```json
{
  "flows": 3,
  "deals": 15,
  "total_sessions": 120,
  "total_messages": 890,
  "failed_messages": 12,
  "trend": [{ "date": "2026-05-25", "count": 45 }, ...]
}
```

---

## Task 1: Install Recharts

**Files:** `frontend/package.json`

- [ ] **Step 1: Install recharts**
```bash
cd frontend && npm install recharts
```
Expected: added recharts and dependencies

---

## Task 2: Create shared StatCard component

**Files:**
- Create: `frontend/src/components/ui/StatCard.jsx`

- [ ] **Step 1: Create StatCard**

```jsx
// frontend/src/components/ui/StatCard.jsx
export default function StatCard({ label, value, sub, color = '#6366f1', icon }) {
  return (
    <div className="bg-white rounded-2xl p-6"
      style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
          {label}
        </p>
        {icon && (
          <span className="text-xl leading-none">{icon}</span>
        )}
      </div>
      <p className="text-3xl font-black" style={{ color: '#1a1d2e' }}>{value ?? '—'}</p>
      {sub && <p className="text-xs mt-1 font-medium" style={{ color }}>{sub}</p>}
    </div>
  )
}
```

---

## Task 3: Build full Dashboard page

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Replace Dashboard.jsx with full implementation**

```jsx
// frontend/src/pages/Dashboard.jsx
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

  // Build lead distribution for bar chart
  const leadData = stats ? [
    { name: 'Hot',  value: stats.hotLeads  ?? 0 },
    { name: 'Warm', value: stats.warmLeads ?? 0 },
    { name: 'Cold', value: stats.coldLeads ?? 0 },
  ] : []

  // Format trend dates
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
          <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }}></span>
          Uptime: {stats?.uptime ?? '—'}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: '#9ca3af' }}>
          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }}></div>
          Loading stats…
        </div>
      )}

      {/* KPI Row 1 — Conversations */}
      <div className="grid grid-cols-2 gap-5 mb-5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Total Conversations" value={stats?.totalConversations} sub="All time" icon="💬" />
        <StatCard label="Active Chats"         value={stats?.activeChats}        sub="Right now"  color="#10b981" icon="🟢" />
        <StatCard label="Paused Chats"         value={stats?.pausedChats}         sub="Human takeover" color="#f59e0b" icon="⏸️" />
        <StatCard label="Human Interventions"  value={stats?.humanInterventions}  sub="Escalated" color="#ef4444" icon="🙋" />
      </div>

      {/* KPI Row 2 — Campaigns & Delivery */}
      <div className="grid grid-cols-2 gap-5 mb-8" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard label="Campaigns"       value={stats?.totalCampaigns}  sub="Total created"     icon="📣" />
        <StatCard label="Delivery Rate"   value={stats?.deliveryRate}    sub="Campaign success"  color="#10b981" icon="✅" />
        <StatCard label="Flows"           value={analytics?.flows}       sub="Active flows"      icon="🔀" />
        <StatCard label="Documents in KB" value={stats?.totalDocuments}  sub="Knowledge base"    icon="📚" />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 mb-6" style={{ gridTemplateColumns: '2fr 1fr' }}>

        {/* Message Trend */}
        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color: '#1a1d2e' }}>Message Volume — Last 7 Days</h3>
          <p className="text-xs mb-4" style={{ color: '#9ca3af' }}>
            Total messages: <strong style={{ color: '#1a1d2e' }}>{analytics?.total_messages ?? 0}</strong>
          </p>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#d1d5db' }}>
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
        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
          <h3 className="text-sm font-bold mb-1" style={{ color: '#1a1d2e' }}>Lead Distribution</h3>
          <p className="text-xs mb-4" style={{ color: '#9ca3af' }}>By temperature category</p>

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

          {/* Legend */}
          <div className="flex gap-4 mt-4 justify-center">
            {leadData.map(({ name, value }) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: LEAD_COLORS[name] }}></span>
                <span className="text-xs font-semibold" style={{ color: '#6b7280' }}>{name}: {value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row — Total messages & failed */}
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard label="Total Messages"   value={analytics?.total_messages} sub="All conversations" icon="📨" />
        <StatCard label="Failed Messages"  value={analytics?.failed_messages} sub="Campaign failures" color="#ef4444" icon="❌" />
        <StatCard label="Deals Created"    value={analytics?.deals} sub="In pipelines" color="#06b6d4" icon="🤝" />
      </div>
    </div>
  )
}
```

---

## Task 4: Verify Dashboard loads correctly

- [ ] **Step 1: Make sure dev server is running**
```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Open browser**
Navigate to `http://localhost:5173/dashboard`

Expected:
- KPI cards visible (show `—` if no client selected or backend offline)
- Select a client from sidebar dropdown → cards update with real numbers
- Message trend line chart appears with 7-day data
- Lead distribution bar chart shows Hot/Warm/Cold bars

- [ ] **Step 3: Verify API proxy works**
Open browser console → Network tab → confirm `/api/stats` and `/api/analytics` calls return 200

---

## ✅ Phase 2 Complete

After this phase:
- Dashboard shows 11 KPI stat cards with real data
- Message trend chart (last 7 days)
- Lead distribution bar chart (Hot/Warm/Cold)
- Auto-refreshes every 60 seconds
- Shows "Select a client" prompt when no client chosen

**Next phase options:**
- Phase 3: Chats/Inbox page (3-pane, real messages)
- Phase 3: Contacts page (table, search, CSV import, tags)

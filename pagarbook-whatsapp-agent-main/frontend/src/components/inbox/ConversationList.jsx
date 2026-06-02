import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import api from '../../api/client'

const FILTERS = [
  { key: '',      label: 'All' },
  { key: 'hot',   label: '🔥 Hot' },
  { key: 'warm',  label: '🟡 Warm' },
  { key: 'cold',  label: '🔵 Cold' },
  { key: 'human', label: '🙋 Human' },
]

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_DOT = {
  active: '#10b981',
  paused: '#f59e0b',
  closed: '#9ca3af',
}

const LEAD_BADGE = {
  hot:  { bg: 'rgba(239,68,68,.1)',   color: '#ef4444', label: 'Hot' },
  warm: { bg: 'rgba(245,158,11,.1)',  color: '#f59e0b', label: 'Warm' },
  cold: { bg: 'rgba(6,182,212,.1)',   color: '#06b6d4', label: 'Cold' },
}

export default function ConversationList({ selectedId, onSelect }) {
  const { clientId } = useAuthStore()
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', clientId, filter],
    queryFn: () => api.get(`/sessions?client_id=${clientId}&filter=${filter}`).then(r => r.data),
    enabled: !!clientId,
    refetchInterval: 15_000,
  })

  const filtered = sessions.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (s.customer_phone || '').includes(q) ||
      (s.customer_name  || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex flex-col h-full" style={{ width: 300, minWidth: 300, borderRight: '1px solid #e8eaf0' }}>

      {/* Header */}
      <div className="p-4" style={{ borderBottom: '1px solid #e8eaf0' }}>
        <h3 className="font-bold text-sm mb-3" style={{ color: '#1a1d2e' }}>
          Conversations <span className="font-normal ml-1" style={{ color: '#9ca3af' }}>({filtered.length})</span>
        </h3>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3"
          style={{ border: '1px solid #e8eaf0', background: '#f8faff', fontFamily: 'inherit' }}
        />

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border-none cursor-pointer transition-all"
              style={{
                background: filter === f.key ? '#6366f1' : '#f0f2f8',
                color:      filter === f.key ? '#fff'    : '#6b7280',
                fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-20 text-xs" style={{ color: '#9ca3af' }}>
            Loading…
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-xs" style={{ color: '#d1d5db' }}>
            <p className="text-2xl mb-2">💬</p>
            <p>No conversations found</p>
          </div>
        )}

        {filtered.map(s => {
          const badge = LEAD_BADGE[s.lead_category]
          const isSelected = s.session_id === selectedId

          return (
            <div
              key={s.session_id}
              onClick={() => onSelect(s)}
              className="px-4 py-3 cursor-pointer transition-all"
              style={{
                borderBottom: '1px solid #f0f2f8',
                background: isSelected ? 'rgba(99,102,241,.06)' : 'transparent',
                borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
              }}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  {/* Status dot */}
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                    style={{ background: STATUS_DOT[s.session_status] || '#9ca3af' }}></span>
                  <span className="text-sm font-semibold truncate max-w-[140px]" style={{ color: '#1a1d2e' }}>
                    {s.customer_name || s.customer_phone}
                  </span>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#9ca3af' }}>
                  {timeAgo(s.last_interaction)}
                </span>
              </div>

              <div className="flex items-center justify-between pl-4">
                <span className="text-xs truncate" style={{ color: '#9ca3af', maxWidth: 160 }}>
                  {s.customer_phone}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {badge && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: badge.bg, color: badge.color, fontSize: 10 }}>
                      {badge.label}
                    </span>
                  )}
                  {s.human_intervened_at && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: 'rgba(99,102,241,.1)', color: '#6366f1', fontSize: 10 }}>
                      Agent
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

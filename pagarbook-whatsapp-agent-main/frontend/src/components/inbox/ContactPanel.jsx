import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import api from '../../api/client'
import toast from 'react-hot-toast'

export default function ContactPanel({ session }) {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()

  const [noteText, setNoteText]   = useState('')
  const [summary, setSummary]     = useState('')
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [activeTab, setActiveTab] = useState('info') // info | notes | summary

  const { data: agents = [] } = useQuery({
    queryKey: ['team', clientId],
    queryFn: () => api.get(`/team?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const noteMutation = useMutation({
    mutationFn: (note_text) =>
      api.post(`/sessions/${session.session_id}/note`, { client_id: clientId, note_text }),
    onSuccess: () => {
      setNoteText('')
      toast.success('Note added')
      qc.invalidateQueries({ queryKey: ['messages', session.session_id] })
    },
    onError: () => toast.error('Failed to add note'),
  })

  const assignMutation = useMutation({
    mutationFn: (agent_id) =>
      api.post(`/sessions/${session.session_id}/assign`, { client_id: clientId, agent_id }),
    onSuccess: () => {
      toast.success('Assigned')
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const handleSummarize = async () => {
    setLoadingSummary(true)
    setSummary('')
    try {
      const { data } = await api.post('/chats/summarize', {
        client_id: clientId,
        sessionId: session.session_id,
      })
      setSummary(data.summary || 'No summary available.')
      setActiveTab('summary')
    } catch {
      toast.error('Summary failed')
    } finally {
      setLoadingSummary(false)
    }
  }

  if (!session) return null

  const tabs = ['info', 'notes', 'summary']

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{ width: 280, minWidth: 280, borderLeft: '1px solid #e8eaf0', background: '#f8faff' }}>

      {/* Contact header */}
      <div className="p-4 bg-white" style={{ borderBottom: '1px solid #e8eaf0' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#06b6d4)' }}>
            {(session.customer_name || session.customer_phone)?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate" style={{ color: '#1a1d2e' }}>
              {session.customer_name || 'Unknown'}
            </p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>{session.customer_phone}</p>
          </div>
        </div>

        {/* AI Summary button */}
        <button
          onClick={handleSummarize}
          disabled={loadingSummary}
          className="w-full py-2 rounded-lg text-xs font-semibold border-none cursor-pointer"
          style={{
            background: loadingSummary ? '#f0f2f8' : 'rgba(99,102,241,.1)',
            color: loadingSummary ? '#9ca3af' : '#6366f1',
            fontFamily: 'inherit',
          }}
        >
          {loadingSummary ? '⏳ Summarizing…' : '✨ AI Summary'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid #e8eaf0', background: '#fff' }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="flex-1 py-2.5 text-xs font-semibold capitalize border-none cursor-pointer transition-all"
            style={{
              background: 'transparent',
              color:      activeTab === t ? '#6366f1' : '#9ca3af',
              borderBottom: activeTab === t ? '2px solid #6366f1' : '2px solid transparent',
              fontFamily: 'inherit',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* INFO tab */}
        {activeTab === 'info' && (
          <div className="flex flex-col gap-4">
            {/* Status */}
            <div className="bg-white rounded-xl p-3" style={{ border: '1px solid #e8eaf0' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Status</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full"
                  style={{ background: session.session_status === 'active' ? '#10b981' : '#f59e0b' }}></span>
                <span className="text-sm font-semibold capitalize" style={{ color: '#1a1d2e' }}>
                  {session.session_status}
                </span>
              </div>
            </div>

            {/* Lead category */}
            <div className="bg-white rounded-xl p-3" style={{ border: '1px solid #e8eaf0' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Lead Category</p>
              <span className="text-sm font-semibold capitalize" style={{ color: '#1a1d2e' }}>
                {session.lead_category || '—'}
              </span>
            </div>

            {/* Assign agent */}
            <div className="bg-white rounded-xl p-3" style={{ border: '1px solid #e8eaf0' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>Assigned Agent</p>
              <select
                className="w-full text-sm rounded-lg px-2 py-1.5 outline-none"
                style={{ border: '1px solid #e8eaf0', background: '#f8faff', fontFamily: 'inherit', color: '#1a1d2e' }}
                value={session.assigned_agent_id || ''}
                onChange={e => assignMutation.mutate(e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
              </select>
            </div>

            {/* Message count */}
            <div className="bg-white rounded-xl p-3" style={{ border: '1px solid #e8eaf0' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>Messages</p>
              <p className="text-lg font-black" style={{ color: '#1a1d2e' }}>{session.msg_count || 0}</p>
            </div>
          </div>
        )}

        {/* NOTES tab */}
        {activeTab === 'notes' && (
          <div className="flex flex-col gap-3">
            <textarea
              rows={3}
              placeholder="Write an internal note…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
              style={{
                border: '1px solid #e8eaf0',
                background: '#fff',
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#e8eaf0'}
            />
            <button
              onClick={() => noteText.trim() && noteMutation.mutate(noteText.trim())}
              disabled={!noteText.trim() || noteMutation.isPending}
              className="w-full py-2 rounded-lg text-xs font-semibold border-none cursor-pointer"
              style={{
                background: noteText.trim() ? '#6366f1' : '#e8eaf0',
                color:      noteText.trim() ? '#fff'    : '#9ca3af',
                fontFamily: 'inherit',
              }}
            >
              {noteMutation.isPending ? 'Saving…' : 'Add Note'}
            </button>

            {session.internal_notes && (
              <div className="bg-white rounded-xl p-3 mt-1" style={{ border: '1px solid #e8eaf0' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>
                  Previous Notes
                </p>
                <p className="text-xs whitespace-pre-wrap" style={{ color: '#6b7280', lineHeight: 1.6 }}>
                  {session.internal_notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* SUMMARY tab */}
        {activeTab === 'summary' && (
          <div>
            {summary ? (
              <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #e8eaf0' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
                  ✨ AI Summary
                </p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: '#1a1d2e', lineHeight: 1.7 }}>
                  {summary}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-xs text-center"
                style={{ color: '#d1d5db' }}>
                <p className="text-2xl mb-2">✨</p>
                <p>Click "AI Summary" above<br />to generate a summary</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

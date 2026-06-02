import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import api from '../../api/client'
import toast from 'react-hot-toast'

function MessageBubble({ msg }) {
  const isAgent    = msg.sender_type === 'agent'
  const isNote     = msg.sender_type === 'agent_note'
  const isOutbound = isAgent || isNote

  if (isNote) {
    return (
      <div className="flex justify-center my-2">
        <div className="px-4 py-2 rounded-xl text-xs font-medium max-w-xs text-center"
          style={{ background: 'rgba(245,158,11,.1)', color: '#92400e', border: '1px dashed #f59e0b' }}>
          📝 Note: {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex mb-3 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className="px-4 py-2.5 rounded-2xl text-sm max-w-xs break-words"
        style={{
          background:    isOutbound ? '#6366f1' : '#fff',
          color:         isOutbound ? '#fff'    : '#1a1d2e',
          border:        isOutbound ? 'none'    : '1px solid #e8eaf0',
          borderRadius:  isOutbound ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          boxShadow:     '0 1px 4px rgba(0,0,0,.06)',
        }}
      >
        {msg.message_type === 'image' && msg.media_url ? (
          <img src={msg.media_url} alt="media" className="rounded-lg max-w-full mb-1" style={{ maxHeight: 200 }} />
        ) : null}
        {msg.content && <p style={{ lineHeight: 1.5 }}>{msg.content}</p>}
        <p className="text-right mt-1" style={{ fontSize: 10, opacity: 0.6 }}>
          {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

export default function MessageThread({ session, onStatusChange }) {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const bottomRef = useRef(null)

  const [text, setText]     = useState('')
  const [sending, setSending] = useState(false)

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', session?.session_id],
    queryFn: () =>
      api.get(`/sessions/${session.session_id}?client_id=${clientId}`).then(r => r.data),
    enabled: !!session?.session_id && !!clientId,
    refetchInterval: 8_000,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMutation = useMutation({
    mutationFn: (payload) =>
      api.post(`/sessions/${session.session_id}/reply`, { client_id: clientId, ...payload }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['messages', session.session_id] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: () => toast.error('Failed to send message'),
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/sessions/${session.session_id}/pause`, { client_id: clientId }),
    onSuccess: () => { toast.success('Bot paused'); onStatusChange?.() },
  })

  const resumeMutation = useMutation({
    mutationFn: () => api.post(`/sessions/${session.session_id}/resume`, { client_id: clientId }),
    onSuccess: () => { toast.success('Bot resumed'); onStatusChange?.() },
  })

  const handleSend = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      await sendMutation.mutateAsync({ message: text, type: 'text' })
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#f8faff' }}>
        <div className="text-center">
          <p className="text-5xl mb-3">💬</p>
          <p className="font-semibold" style={{ color: '#6b7280' }}>Select a conversation</p>
        </div>
      </div>
    )
  }

  const isPaused = session.session_status === 'paused'

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Thread header */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid #e8eaf0', background: '#fff', minHeight: 60 }}>
        <div>
          <p className="font-bold text-sm" style={{ color: '#1a1d2e' }}>
            {session.customer_name || session.customer_phone}
          </p>
          <p className="text-xs" style={{ color: '#9ca3af' }}>
            {session.customer_name ? session.customer_phone : ''} &nbsp;·&nbsp;
            <span style={{ color: isPaused ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
              {isPaused ? '⏸ Paused' : '🟢 Active'}
            </span>
            &nbsp;·&nbsp; {session.lead_category || 'unclassified'}
          </p>
        </div>

        <div className="flex gap-2">
          {isPaused ? (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
              style={{ background: 'rgba(16,185,129,.1)', color: '#10b981', fontFamily: 'inherit' }}
            >
              ▶ Resume Bot
            </button>
          ) : (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
              style={{ background: 'rgba(245,158,11,.1)', color: '#f59e0b', fontFamily: 'inherit' }}
            >
              ⏸ Pause Bot
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: '#f8faff' }}>
        {isLoading && (
          <div className="flex justify-center pt-10 text-xs" style={{ color: '#9ca3af' }}>Loading messages…</div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Send bar */}
      <div className="px-4 py-3 flex items-end gap-3"
        style={{ borderTop: '1px solid #e8eaf0', background: '#fff' }}>
        <textarea
          rows={2}
          placeholder={isPaused ? 'Bot is paused — you are in control…' : 'Type a message (sends & pauses bot)…'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none"
          style={{
            border: '1px solid #e8eaf0',
            background: '#f8faff',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
          onFocus={e => e.target.style.borderColor = '#6366f1'}
          onBlur={e => e.target.style.borderColor = '#e8eaf0'}
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="flex items-center justify-center rounded-xl px-4 py-3 font-semibold text-sm border-none cursor-pointer transition-all"
          style={{
            background: sending || !text.trim() ? '#e8eaf0' : '#6366f1',
            color:      sending || !text.trim() ? '#9ca3af' : '#fff',
            minWidth: 80,
            fontFamily: 'inherit',
          }}
        >
          {sending ? '…' : 'Send ↑'}
        </button>
      </div>
    </div>
  )
}

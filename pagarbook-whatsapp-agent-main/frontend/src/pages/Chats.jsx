import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import ConversationList from '../components/inbox/ConversationList'
import MessageThread    from '../components/inbox/MessageThread'
import ContactPanel     from '../components/inbox/ContactPanel'

export default function Chats() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [selectedSession, setSelectedSession] = useState(null)

  const handleSelect = (session) => {
    setSelectedSession(session)
  }

  const handleStatusChange = () => {
    qc.invalidateQueries({ queryKey: ['sessions', clientId] })
    if (selectedSession) {
      setSelectedSession(prev => ({
        ...prev,
        session_status: prev.session_status === 'active' ? 'paused' : 'active'
      }))
    }
  }

  if (!clientId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">👈</p>
          <p className="font-semibold" style={{ color: '#1a1d2e' }}>Select a client from the sidebar</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex rounded-2xl overflow-hidden"
      style={{
        height: 'calc(100vh - 130px)',
        border: '1px solid #e8eaf0',
        boxShadow: '0 4px 24px rgba(0,0,0,.06)',
        background: '#fff',
      }}>

      {/* Left: Conversation List */}
      <ConversationList
        selectedId={selectedSession?.session_id}
        onSelect={handleSelect}
      />

      {/* Center: Message Thread */}
      <MessageThread
        session={selectedSession}
        onStatusChange={handleStatusChange}
      />

      {/* Right: Contact Details */}
      {selectedSession && (
        <ContactPanel session={selectedSession} />
      )}
    </div>
  )
}

import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

const PAGE_TITLES = {
  '/dashboard':   'Dashboard',
  '/chats':       'Inbox',
  '/contacts':    'Contacts',
  '/leads':       'Leads',
  '/campaigns':   'Campaigns',
  '/templates':   'Templates',
  '/flows':       'Flows',
  '/automations': 'Automations',
  '/inbox-rules': 'Inbox Rules',
  '/sequences':   'Sequences',
  '/analytics':   'Analytics',
  '/settings':    'Settings',
}

export default function Topbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const title = PAGE_TITLES[pathname] ?? 'WhatsApp Platform'

  const now = new Date().toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="flex items-center justify-between px-9 bg-white border-b"
      style={{ height: 64, background: 'rgba(255,255,255,.85)', borderColor: '#e8eaf0', backdropFilter: 'blur(10px)' }}>
      <h1 className="text-lg font-bold" style={{ color: '#1a1d2e' }}>{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm" style={{ color: '#6b7280' }}>{now}</span>
        <button
          onClick={handleLogout}
          className="text-xs transition-colors cursor-pointer border-none bg-transparent"
          style={{ color: '#6b7280' }}
          onMouseEnter={e => e.target.style.color = '#ef4444'}
          onMouseLeave={e => e.target.style.color = '#6b7280'}
        >
          {user ? `${user.full_name || user.email} · Logout` : 'Logout'}
        </button>
      </div>
    </header>
  )
}

import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

const NAV = [
  { to: '/dashboard',   icon: '📊', label: 'Dashboard' },
  { to: '/chats',       icon: '💬', label: 'Inbox' },
  { to: '/contacts',    icon: '👥', label: 'Contacts' },
  { to: '/leads',       icon: '🎯', label: 'Leads',        isNew: true },
  { to: '/campaigns',   icon: '📣', label: 'Campaigns' },
  { to: '/templates',   icon: '📄', label: 'Templates' },
  { to: '/flows',       icon: '🔀', label: 'Flows' },
  { to: '/automations', icon: '⚡', label: 'Automations' },
  { to: '/inbox-rules', icon: '📬', label: 'Inbox Rules',  isNew: true },
  { to: '/sequences',   icon: '🔁', label: 'Sequences',    isNew: true },
  { to: '/analytics',   icon: '📈', label: 'Analytics' },
  { to: '/settings',    icon: '⚙️',  label: 'Settings' },
]

export default function Sidebar() {
  const { clients, clientId, setClientId } = useAuthStore()

  return (
    <aside style={{ width: 240, minWidth: 240, background: '#1e1f2e' }}
      className="flex flex-col p-4 z-20 h-screen overflow-y-auto">

      {/* Logo */}
      <div className="flex items-center gap-2 mb-6 px-2">
        <div style={{ background: 'linear-gradient(135deg,#6366f1,#06b6d4)', boxShadow: '0 4px 14px rgba(99,102,241,.4)' }}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg">
          W
        </div>
        <span className="text-white font-bold text-base tracking-tight">WA Platform</span>
      </div>

      {/* Client selector */}
      <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}
        className="rounded-xl p-3 mb-5">
        <label className="text-xs block mb-1" style={{ color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Client
        </label>
        <select
          style={{ background: 'transparent', border: 'none', color: '#fff', fontFamily: 'inherit' }}
          className="w-full text-sm font-semibold outline-none cursor-pointer"
          value={clientId || ''}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="" disabled>Select client…</option>
          {clients.map(c => (
            <option key={c.id} value={c.id} style={{ background: '#2d2f42' }}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV.map(({ to, icon, label, isNew }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all no-underline
               ${isActive
                 ? 'text-white'
                 : 'hover:text-white'}`
            }
            style={({ isActive }) => ({
              background: isActive ? 'rgba(99,102,241,.25)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,.6)',
            })}
          >
            <span className="text-base leading-none">{icon}</span>
            <span>{label}</span>
            {isNew && (
              <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(6,182,212,.2)', color: '#06b6d4', fontSize: 9 }}>
                NEW
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div className="flex items-center gap-2 px-2">
          <span className="w-2 h-2 rounded-full" style={{ background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
          <span className="text-xs text-white font-semibold">Online</span>
        </div>
      </div>
    </aside>
  )
}

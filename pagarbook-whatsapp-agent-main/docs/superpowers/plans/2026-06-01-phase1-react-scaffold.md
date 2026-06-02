# Phase 1: React Scaffold + Core Layout

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Create a working React + Vite frontend with sidebar, routing, and all 12 pages as stubs — replacing the HTML file.

**Architecture:** `frontend/` directory inside the existing project. Vite dev server proxies `/api` to Express on port 3000. `npm run build` outputs to `public/` which Express already serves statically.

**Tech Stack:** React 18, Vite, React Router v6, Tailwind CSS, Zustand, TanStack Query v5, Axios

---

## Task 1: Initialize the Vite + React project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`

- [ ] **Step 1: Scaffold the project**

Run from `d:\pagarbook-whatsapp-agent-main`:
```bash
cd frontend
npm create vite@latest . -- --template react
```
When prompted: select **React**, then **JavaScript**.

- [ ] **Step 2: Install all dependencies**

```bash
npm install react-router-dom @tanstack/react-query axios zustand react-hot-toast
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: Replace `vite.config.js`**

```js
// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  }
})
```

- [ ] **Step 4: Replace `tailwind.config.js`**

```js
// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        'primary-hover': '#4f46e5',
        sidebar: '#1e1f2e',
        accent: '#06b6d4',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      borderRadius: {
        card: '14px',
      }
    },
  },
  plugins: [],
}
```

- [ ] **Step 5: Replace `src/index.css`**

```css
/* frontend/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

* { font-family: 'Plus Jakarta Sans', sans-serif; }
body { background: #f0f2f8; }
```

- [ ] **Step 6: Verify it starts**

```bash
npm run dev
```
Expected: Vite server running at `http://localhost:5173`

---

## Task 2: Zustand store + Axios client

**Files:**
- Create: `frontend/src/store/auth.js`
- Create: `frontend/src/api/client.js`

- [ ] **Step 1: Create auth store**

```js
// frontend/src/store/auth.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      clientId: null,
      user: null,
      clients: [],
      setToken: (token) => set({ token }),
      setClientId: (clientId) => set({ clientId }),
      setUser: (user) => set({ user }),
      setClients: (clients) => set({ clients }),
      logout: () => set({ token: null, clientId: null, user: null }),
    }),
    { name: 'pb-auth' }
  )
)
```

- [ ] **Step 2: Create axios client**

```js
// frontend/src/api/client.js
import axios from 'axios'
import { useAuthStore } from '../store/auth'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
```

---

## Task 3: App entry point + Router

**Files:**
- Modify: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`

- [ ] **Step 1: Replace `main.jsx`**

```jsx
// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 2: Create `App.jsx` with all routes**

```jsx
// frontend/src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard    from './pages/Dashboard'
import Chats        from './pages/Chats'
import Contacts     from './pages/Contacts'
import Campaigns    from './pages/Campaigns'
import Templates    from './pages/Templates'
import Flows        from './pages/Flows'
import Automations  from './pages/Automations'
import InboxRules   from './pages/InboxRules'
import Sequences    from './pages/Sequences'
import Leads        from './pages/Leads'
import Analytics    from './pages/Analytics'
import Settings     from './pages/Settings'
import Login        from './pages/Login'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<Dashboard />} />
        <Route path="chats"       element={<Chats />} />
        <Route path="contacts"    element={<Contacts />} />
        <Route path="campaigns"   element={<Campaigns />} />
        <Route path="templates"   element={<Templates />} />
        <Route path="flows"       element={<Flows />} />
        <Route path="automations" element={<Automations />} />
        <Route path="inbox-rules" element={<InboxRules />} />
        <Route path="sequences"   element={<Sequences />} />
        <Route path="leads"       element={<Leads />} />
        <Route path="analytics"   element={<Analytics />} />
        <Route path="settings"    element={<Settings />} />
      </Route>
    </Routes>
  )
}
```

---

## Task 4: Sidebar component

**Files:**
- Create: `frontend/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Create Sidebar**

```jsx
// frontend/src/components/layout/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

const NAV = [
  { to: '/dashboard',   icon: '📊', label: 'Dashboard' },
  { to: '/chats',       icon: '💬', label: 'Inbox' },
  { to: '/contacts',    icon: '👥', label: 'Contacts' },
  { to: '/leads',       icon: '🎯', label: 'Leads',     isNew: true },
  { to: '/campaigns',   icon: '📣', label: 'Campaigns' },
  { to: '/templates',   icon: '📄', label: 'Templates' },
  { to: '/flows',       icon: '🔀', label: 'Flows' },
  { to: '/automations', icon: '⚡', label: 'Automations' },
  { to: '/inbox-rules', icon: '📬', label: 'Inbox Rules', isNew: true },
  { to: '/sequences',   icon: '🔁', label: 'Sequences',  isNew: true },
  { to: '/analytics',   icon: '📈', label: 'Analytics' },
  { to: '/settings',    icon: '⚙️', label: 'Settings' },
]

export default function Sidebar() {
  const { clients, clientId, setClientId } = useAuthStore()

  return (
    <aside className="w-60 min-w-[240px] bg-sidebar flex flex-col p-4 z-20 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-6 px-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-black text-lg shadow-lg">
          W
        </div>
        <span className="text-white font-bold text-base tracking-tight">WA Platform</span>
      </div>

      {/* Client selector */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-5">
        <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">Client</label>
        <select
          className="w-full bg-transparent border-none text-white text-sm font-semibold outline-none cursor-pointer"
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
      <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {NAV.map(({ to, icon, label, isNew }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
               ${isActive
                 ? 'bg-primary/25 text-white'
                 : 'text-white/60 hover:bg-white/6 hover:text-white'}`
            }
          >
            <span className="text-base">{icon}</span>
            <span>{label}</span>
            {isNew && (
              <span className="ml-auto text-[9px] font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                NEW
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-3 border-t border-white/6">
        <div className="flex items-center gap-2 px-2">
          <span className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_#10b981]"></span>
          <span className="text-xs text-white font-semibold">Online</span>
        </div>
      </div>
    </aside>
  )
}
```

---

## Task 5: Topbar + Layout wrapper

**Files:**
- Create: `frontend/src/components/layout/Topbar.jsx`
- Create: `frontend/src/components/layout/Layout.jsx`

- [ ] **Step 1: Create Topbar**

```jsx
// frontend/src/components/layout/Topbar.jsx
import { useLocation } from 'react-router-dom'
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
  const { user, logout } = useAuthStore()
  const title = PAGE_TITLES[pathname] ?? 'WhatsApp Platform'

  const now = new Date().toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <header className="h-16 flex items-center justify-between px-9 bg-white/85 border-b border-gray-100 backdrop-blur-md">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">{now}</span>
        {user && (
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            Logout
          </button>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Create Layout**

```jsx
// frontend/src/components/layout/Layout.jsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'
import { useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import api from '../../api/client'

export default function Layout() {
  const { setClients, setClientId, clientId } = useAuthStore()

  // Load clients on mount
  useEffect(() => {
    api.get('/clients').then(r => {
      const list = r.data
      setClients(list)
      if (!clientId && list.length > 0) setClientId(list[0].id)
    }).catch(() => {})
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-8 bg-[#f0f2f8]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

---

## Task 6: Stub pages (all 13 pages)

**Files:**
- Create: `frontend/src/pages/Login.jsx`
- Create: `frontend/src/pages/Dashboard.jsx`
- Create: `frontend/src/pages/Chats.jsx`
- Create: `frontend/src/pages/Contacts.jsx`
- Create: `frontend/src/pages/Campaigns.jsx`
- Create: `frontend/src/pages/Templates.jsx`
- Create: `frontend/src/pages/Flows.jsx`
- Create: `frontend/src/pages/Automations.jsx`
- Create: `frontend/src/pages/InboxRules.jsx`
- Create: `frontend/src/pages/Sequences.jsx`
- Create: `frontend/src/pages/Leads.jsx`
- Create: `frontend/src/pages/Analytics.jsx`
- Create: `frontend/src/pages/Settings.jsx`

- [ ] **Step 1: Create Login page stub**

```jsx
// frontend/src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { setToken, setUser } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setToken(data.token)
      setUser(data.user)
      navigate('/dashboard')
    } catch {
      toast.error('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f8] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-black text-xl">
            W
          </div>
          <span className="text-xl font-bold text-gray-900">WA Platform</span>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary bg-gray-50"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary bg-gray-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create stub for every other page**

Use this pattern for all remaining pages (Dashboard, Chats, Contacts, Campaigns, Templates, Flows, Automations, InboxRules, Sequences, Leads, Analytics, Settings):

```jsx
// frontend/src/pages/Dashboard.jsx
export default function Dashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
      <div className="bg-white rounded-2xl shadow p-8 text-gray-400 text-center">
        Dashboard coming soon…
      </div>
    </div>
  )
}
```

Create each file with its name substituted. Example files to create:
- `frontend/src/pages/Chats.jsx` — label "Inbox"
- `frontend/src/pages/Contacts.jsx`
- `frontend/src/pages/Campaigns.jsx`
- `frontend/src/pages/Templates.jsx`
- `frontend/src/pages/Flows.jsx`
- `frontend/src/pages/Automations.jsx`
- `frontend/src/pages/InboxRules.jsx` — label "Inbox Rules"
- `frontend/src/pages/Sequences.jsx`
- `frontend/src/pages/Leads.jsx`
- `frontend/src/pages/Analytics.jsx`
- `frontend/src/pages/Settings.jsx`

---

## Task 7: Update root package.json with frontend scripts

**Files:**
- Modify: `package.json` (root — backend)

- [ ] **Step 1: Add scripts to root package.json**

Edit `d:\pagarbook-whatsapp-agent-main\package.json`:

```json
{
  "name": "pagarbook-whatsapp-bot",
  "version": "1.0.0",
  "description": "Pagarbook WhatsApp AI Agent Webhook Server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev:backend": "node server.js",
    "dev:frontend": "cd frontend && npm run dev",
    "build:frontend": "cd frontend && npm run build",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\""
  },
  "dependencies": {
    "bullmq": "^5.8.3",
    "concurrently": "^8.2.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "googleapis": "^137.0.0",
    "mammoth": "^1.7.2",
    "pdf-parse": "^1.1.1",
    "pg": "^8.11.5",
    "redis": "^4.6.13"
  }
}
```

- [ ] **Step 2: Install concurrently**

```bash
npm install concurrently
```

---

## Task 8: Verify Phase 1 works end-to-end

- [ ] **Step 1: Start backend**

```bash
# In d:\pagarbook-whatsapp-agent-main
node server.js
```
Expected: `Server running on port 3000`

- [ ] **Step 2: Start frontend dev server**

```bash
# In d:\pagarbook-whatsapp-agent-main\frontend
npm run dev
```
Expected: Vite running at `http://localhost:5173`

- [ ] **Step 3: Open browser**

Navigate to `http://localhost:5173`
Expected: Sidebar with all nav items visible, routing between pages works, `/login` shows login form.

- [ ] **Step 4: Verify API proxy**

Navigate to `http://localhost:5173/api/clients`
Expected: JSON response from Express (same as `http://localhost:3000/api/clients`)

---

## ✅ Phase 1 Complete

After this phase you will have:
- React + Vite project running
- Sidebar with all nav items (including 3 new: Leads, Inbox Rules, Sequences)
- Client selector dropdown loading from real API
- All 13 page routes working (stubs)
- Login page UI ready
- API proxy configured for dev
- Build outputs to `public/` for production

**Next phase:** Implement full Dashboard page with stats + chart.

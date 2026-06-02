import { Routes, Route, Navigate } from 'react-router-dom'
import Layout      from './components/layout/Layout'
import Login       from './pages/Login'
import Dashboard   from './pages/Dashboard'
import Chats       from './pages/Chats'
import Contacts    from './pages/Contacts'
import Campaigns   from './pages/Campaigns'
import Templates   from './pages/Templates'
import Flows       from './pages/Flows'
import Automations from './pages/Automations'
import InboxRules  from './pages/InboxRules'
import Sequences   from './pages/Sequences'
import Leads       from './pages/Leads'
import Analytics   from './pages/Analytics'
import Settings    from './pages/Settings'

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

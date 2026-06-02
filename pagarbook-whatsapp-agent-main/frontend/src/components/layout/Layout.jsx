import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'
import { useAuthStore } from '../../store/auth'
import api from '../../api/client'

export default function Layout() {
  const { setClients, setClientId, clientId } = useAuthStore()

  useEffect(() => {
    api.get('/clients')
      .then(r => {
        const list = r.data
        setClients(list)
        if (!clientId && list.length > 0) setClientId(list[0].id)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-8" style={{ background: '#f0f2f8' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

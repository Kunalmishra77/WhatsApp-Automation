import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const { setToken, setUser }   = useAuthStore()
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f2f8' }}>
      <div className="bg-white rounded-2xl p-10 w-full max-w-sm" style={{ boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xl"
            style={{ background: 'linear-gradient(135deg,#6366f1,#06b6d4)' }}>
            W
          </div>
          <span className="text-xl font-bold" style={{ color: '#1a1d2e' }}>WA Platform</span>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="rounded-lg px-4 py-3 text-sm outline-none"
            style={{ border: '1px solid #e8eaf0', background: '#f8faff', fontFamily: 'inherit' }}
            onFocus={e => e.target.style.borderColor = '#6366f1'}
            onBlur={e => e.target.style.borderColor = '#e8eaf0'}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="rounded-lg px-4 py-3 text-sm outline-none"
            style={{ border: '1px solid #e8eaf0', background: '#f8faff', fontFamily: 'inherit' }}
            onFocus={e => e.target.style.borderColor = '#6366f1'}
            onBlur={e => e.target.style.borderColor = '#e8eaf0'}
          />
          <button
            type="submit"
            disabled={loading}
            className="text-white font-semibold py-3 rounded-lg transition-all cursor-pointer border-none"
            style={{ background: loading ? '#a5b4fc' : '#6366f1', fontFamily: 'inherit' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-center mt-6" style={{ color: '#9ca3af' }}>
          WhatsApp AI Platform v2.0
        </p>
      </div>
    </div>
  )
}

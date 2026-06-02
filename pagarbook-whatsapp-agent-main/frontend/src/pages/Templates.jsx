import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

const STATUS_STYLE = {
  APPROVED: { bg: 'rgba(16,185,129,.1)', color: '#10b981' },
  PENDING:  { bg: 'rgba(245,158,11,.1)', color: '#f59e0b' },
  REJECTED: { bg: 'rgba(239,68,68,.1)',  color: '#ef4444' },
  PAUSED:   { bg: 'rgba(107,114,128,.1)',color: '#6b7280' },
}

const CATEGORIES = ['MARKETING','UTILITY','AUTHENTICATION']
const LANGUAGES  = [
  { code:'en',    label:'English' },
  { code:'en_US', label:'English (US)' },
  { code:'hi',    label:'Hindi' },
  { code:'gu',    label:'Gujarati' },
  { code:'mr',    label:'Marathi' },
]

function CreateModal({ onClose, onCreated }) {
  const { clientId } = useAuthStore()
  const [form, setForm] = useState({
    name: '', category: 'MARKETING', language: 'en',
    headerText: '', bodyText: '', footerText: '', buttons: [],
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.bodyText) { toast.error('Name and body required'); return }
    setSaving(true)
    try {
      const components = []
      if (form.headerText) components.push({ type:'HEADER', format:'TEXT', text: form.headerText })
      components.push({ type:'BODY', text: form.bodyText })
      if (form.footerText) components.push({ type:'FOOTER', text: form.footerText })
      await api.post('/templates', {
        client_id: clientId,
        name: form.name.toLowerCase().replace(/\s+/g,'_'),
        category: form.category,
        language: form.language,
        components,
      })
      toast.success('Template submitted for approval')
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create template')
    } finally { setSaving(false) }
  }

  const inp = "w-full rounded-lg px-3 py-2.5 text-sm outline-none"
  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto" style={{ maxHeight:'90vh', border:'1px solid #e8eaf0' }} onClick={e=>e.stopPropagation()}>
        <h3 className="text-base font-bold mb-5" style={{ color:'#1a1d2e' }}>Create New Template</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Template Name *</label>
              <input value={form.name} onChange={set('name')} placeholder="e.g. welcome_message" className={inp} style={inpStyle} required />
              <p className="text-xs mt-1" style={{ color:'#9ca3af' }}>Lowercase, underscores only</p>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Category *</label>
              <select value={form.category} onChange={set('category')} className={inp} style={inpStyle}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Language *</label>
            <select value={form.language} onChange={set('language')} className={inp} style={inpStyle}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Header Text (optional)</label>
            <input value={form.headerText} onChange={set('headerText')} placeholder="Header line" className={inp} style={inpStyle} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Body * <span style={{ color:'#9ca3af', fontWeight:400 }}>Use {'{{1}}'} for variables</span></label>
            <textarea value={form.bodyText} onChange={set('bodyText')} rows={4} placeholder="Hello {{1}}, your order {{2}} is ready!" className={inp + " resize-none"} style={inpStyle} required />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Footer Text (optional)</label>
            <input value={form.footerText} onChange={set('footerText')} placeholder="Reply STOP to unsubscribe" className={inp} style={inpStyle} />
          </div>
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer" style={{ background:'#f0f2f8', color:'#6b7280', fontFamily:'inherit' }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background: saving ? '#a5b4fc' : '#6366f1', fontFamily:'inherit' }}>
              {saving ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Templates() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates', clientId],
    queryFn: () => api.get(`/templates?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const deleteMutation = useMutation({
    mutationFn: (name) => api.delete(`/templates/${name}?client_id=${clientId}`),
    onSuccess: () => { toast.success('Template deleted'); qc.invalidateQueries({ queryKey:['templates',clientId] }) },
    onError: () => toast.error('Delete failed'),
  })

  const filtered = templates.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !search || t.name.includes(q) || t.category?.toLowerCase().includes(q)
    const matchStatus = filterStatus === 'ALL' || t.status === filterStatus
    return matchSearch && matchStatus
  })

  const statusCounts = templates.reduce((acc, t) => { acc[t.status] = (acc[t.status]||0)+1; return acc }, {})

  if (!clientId) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center"><p className="text-4xl mb-3">👈</p><p className="font-semibold" style={{ color:'#1a1d2e' }}>Select a client from the sidebar</p></div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Templates</h2>
          <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>{templates.length} total · from Meta WhatsApp API</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:'#6366f1', fontFamily:'inherit' }}>
          + New Template
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['ALL','APPROVED','PENDING','REJECTED'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border-none cursor-pointer"
            style={{ background: filterStatus===s ? '#6366f1' : '#f0f2f8', color: filterStatus===s ? '#fff' : '#6b7280', fontFamily:'inherit' }}>
            {s} {s !== 'ALL' && statusCounts[s] ? `(${statusCounts[s]})` : ''}
          </button>
        ))}
        <input type="text" placeholder="Search templates…" value={search} onChange={e=>setSearch(e.target.value)}
          className="ml-auto rounded-xl px-3 py-1.5 text-xs outline-none"
          style={{ border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', width:200 }} />
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="text-center py-16 text-sm" style={{ color:'#9ca3af' }}>Loading templates…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><p className="text-3xl mb-2">📄</p><p className="text-sm" style={{ color:'#9ca3af' }}>No templates found</p></div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))' }}>
          {filtered.map(t => {
            const s = STATUS_STYLE[t.status] || STATUS_STYLE.PENDING
            const body = t.components?.find(c=>c.type==='BODY')?.text || ''
            const header = t.components?.find(c=>c.type==='HEADER' && c.format==='TEXT')?.text || ''
            return (
              <div key={t.name} className="bg-white rounded-2xl p-5 flex flex-col gap-3" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-sm" style={{ color:'#1a1d2e' }}>{t.name}</p>
                    <p className="text-xs mt-0.5" style={{ color:'#9ca3af' }}>{t.category} · {t.language}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background:s.bg, color:s.color }}>{t.status}</span>
                </div>
                {header && <p className="text-xs font-bold" style={{ color:'#1a1d2e' }}>{header}</p>}
                {body && <p className="text-xs leading-relaxed" style={{ color:'#6b7280' }}>{body.slice(0,120)}{body.length>120?'…':''}</p>}
                <div className="flex justify-end mt-auto">
                  <button onClick={() => { if(confirm(`Delete template "${t.name}"?`)) deleteMutation.mutate(t.name) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                    style={{ background:'rgba(239,68,68,.1)', color:'#ef4444', fontFamily:'inherit' }}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); qc.invalidateQueries({ queryKey:['templates',clientId] }) }} />}
    </div>
  )
}

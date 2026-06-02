import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

/* ── helpers ─────────────────────────────────────────── */
function DeliveryBar({ sent, delivered, read, failed, total }) {
  if (!total) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
  const pct = (n) => Math.round((n / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-full overflow-hidden h-2" style={{ width: 80, background: '#f0f2f8' }}>
        <div style={{ width: `${pct(read)}%`,      background: '#6366f1' }} />
        <div style={{ width: `${pct(delivered)}%`, background: '#10b981' }} />
        <div style={{ width: `${pct(sent)}%`,      background: '#06b6d4' }} />
        <div style={{ width: `${pct(failed)}%`,    background: '#ef4444' }} />
      </div>
      <span style={{ fontSize: 11, color: '#9ca3af' }}>{pct(delivered + read)}%</span>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    draft:     { bg: '#f0f2f8',                   color: '#6b7280' },
    running:   { bg: 'rgba(99,102,241,.1)',         color: '#6366f1' },
    completed: { bg: 'rgba(16,185,129,.1)',         color: '#10b981' },
    failed:    { bg: 'rgba(239,68,68,.1)',          color: '#ef4444' },
    paused:    { bg: 'rgba(245,158,11,.1)',         color: '#f59e0b' },
  }
  const s = map[status] || map.draft
  return (
    <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase"
      style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

/* ── Create Campaign Modal ────────────────────────────── */
function CreateModal({ templates, contacts, onClose, onCreated }) {
  const { clientId } = useAuthStore()
  const [step, setStep]         = useState(1)          // 1=name+template  2=recipients  3=confirm
  const [name, setName]         = useState('')
  const [template, setTemplate] = useState(null)
  const [recipients, setRecipients] = useState([])     // [{phone}]
  const [manualPhone, setManualPhone] = useState('')
  const [saving, setSaving]     = useState(false)
  const fileRef = useRef()

  const handleFileCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.trim().split('\n').slice(1)
    const phones = lines.map(l => {
      const parts = l.split(',')
      return (parts[1] || parts[0] || '').trim().replace(/^"|"$/g, '')
    }).filter(Boolean)
    setRecipients(prev => {
      const existing = new Set(prev.map(r => r.phone))
      return [...prev, ...phones.filter(p => !existing.has(p)).map(p => ({ phone: p }))]
    })
    toast.success(`Added ${phones.length} phones from CSV`)
    e.target.value = ''
  }

  const handleAddManual = () => {
    const phone = manualPhone.trim()
    if (!phone) return
    if (recipients.find(r => r.phone === phone)) { toast.error('Already added'); return }
    setRecipients(prev => [...prev, { phone }])
    setManualPhone('')
  }

  const handleAddAllContacts = () => {
    const phones = contacts.map(c => ({ phone: c.phone }))
    setRecipients(phones)
    toast.success(`Added ${phones.length} contacts`)
  }

  const handleSubmit = async () => {
    if (!name || !template || recipients.length === 0) return
    setSaving(true)
    try {
      const { data } = await api.post('/campaigns', {
        client_id:     clientId,
        name,
        template_name: template.name,
        language_code: template.language || 'en',
        recipients,
      })
      toast.success(`Campaign "${name}" launched!`)
      onCreated(data)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create campaign')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { border: '1px solid #e8eaf0', background: '#f8faff', fontFamily: 'inherit', color: '#1a1d2e' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Steps header */}
        <div className="flex items-center gap-0" style={{ borderBottom: '1px solid #e8eaf0' }}>
          {['Template', 'Recipients', 'Confirm'].map((s, i) => (
            <div key={s} className="flex-1 py-3 text-center text-xs font-bold transition-all"
              style={{
                background: step === i + 1 ? '#6366f1' : step > i + 1 ? 'rgba(99,102,241,.1)' : '#f8faff',
                color:      step === i + 1 ? '#fff'    : step > i + 1 ? '#6366f1'              : '#9ca3af',
              }}>
              {step > i + 1 ? '✓ ' : `${i + 1}. `}{s}
            </div>
          ))}
        </div>

        <div className="p-6">

          {/* Step 1: Name + Template */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: '#6b7280' }}>Campaign Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. May Promo Blast" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: '#6b7280' }}>
                  Select Template ({templates.length} available)
                </label>
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {templates.filter(t => t.status === 'APPROVED').map(t => (
                    <div key={t.name} onClick={() => setTemplate(t)}
                      className="px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                      style={{
                        border: `1px solid ${template?.name === t.name ? '#6366f1' : '#e8eaf0'}`,
                        background: template?.name === t.name ? 'rgba(99,102,241,.06)' : '#f8faff',
                      }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: '#1a1d2e' }}>{t.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(16,185,129,.1)', color: '#10b981' }}>
                          {t.language}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{t.category}</p>
                    </div>
                  ))}
                  {templates.filter(t => t.status === 'APPROVED').length === 0 && (
                    <p className="text-sm text-center py-4" style={{ color: '#9ca3af' }}>No approved templates found</p>
                  )}
                </div>
              </div>
              <button onClick={() => { if (!name || !template) { toast.error('Fill name and select a template'); return } setStep(2) }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
                style={{ background: '#6366f1', fontFamily: 'inherit' }}>
                Next: Add Recipients →
              </button>
            </div>
          )}

          {/* Step 2: Recipients */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <input value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                  placeholder="Add phone manually (91XXXXXXXXXX)"
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none" style={inputStyle}
                  onKeyDown={e => e.key === 'Enter' && handleAddManual()} />
                <button onClick={handleAddManual}
                  className="px-3 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer text-white"
                  style={{ background: '#6366f1', fontFamily: 'inherit' }}>
                  Add
                </button>
              </div>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileCSV} />
                <button onClick={() => fileRef.current?.click()}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background: '#f0f2f8', color: '#6b7280', fontFamily: 'inherit' }}>
                  📥 Import CSV
                </button>
                {contacts.length > 0 && (
                  <button onClick={handleAddAllContacts}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer"
                    style={{ background: 'rgba(99,102,241,.1)', color: '#6366f1', fontFamily: 'inherit' }}>
                    👥 All Contacts ({contacts.length})
                  </button>
                )}
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e8eaf0', maxHeight: 180, overflowY: 'auto' }}>
                {recipients.length === 0
                  ? <p className="text-xs text-center py-5" style={{ color: '#d1d5db' }}>No recipients yet</p>
                  : recipients.slice(0, 50).map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2"
                      style={{ borderBottom: '1px solid #f0f2f8' }}>
                      <span className="text-sm" style={{ color: '#1a1d2e' }}>{r.phone}</span>
                      <button onClick={() => setRecipients(prev => prev.filter((_, j) => j !== i))}
                        className="text-xs border-none bg-transparent cursor-pointer"
                        style={{ color: '#ef4444' }}>✕</button>
                    </div>
                  ))
                }
                {recipients.length > 50 && (
                  <p className="text-xs text-center py-2" style={{ color: '#9ca3af' }}>
                    +{recipients.length - 50} more
                  </p>
                )}
              </div>
              <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>
                {recipients.length} recipients selected
              </p>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
                  style={{ background: '#f0f2f8', color: '#6b7280', fontFamily: 'inherit' }}>
                  ← Back
                </button>
                <button onClick={() => { if (!recipients.length) { toast.error('Add at least 1 recipient'); return } setStep(3) }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
                  style={{ background: '#6366f1', fontFamily: 'inherit' }}>
                  Review →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl p-4" style={{ background: '#f8faff', border: '1px solid #e8eaf0' }}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs font-bold mb-0.5" style={{ color: '#9ca3af' }}>Campaign Name</p>
                    <p className="font-semibold" style={{ color: '#1a1d2e' }}>{name}</p></div>
                  <div><p className="text-xs font-bold mb-0.5" style={{ color: '#9ca3af' }}>Template</p>
                    <p className="font-semibold" style={{ color: '#1a1d2e' }}>{template?.name}</p></div>
                  <div><p className="text-xs font-bold mb-0.5" style={{ color: '#9ca3af' }}>Language</p>
                    <p className="font-semibold" style={{ color: '#1a1d2e' }}>{template?.language}</p></div>
                  <div><p className="text-xs font-bold mb-0.5" style={{ color: '#9ca3af' }}>Recipients</p>
                    <p className="font-semibold" style={{ color: '#6366f1' }}>{recipients.length}</p></div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
                  style={{ background: '#f0f2f8', color: '#6b7280', fontFamily: 'inherit' }}>
                  ← Back
                </button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
                  style={{ background: saving ? '#a5b4fc' : '#6366f1', fontFamily: 'inherit' }}>
                  {saving ? '⏳ Launching…' : '🚀 Launch Campaign'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main page ────────────────────────────────────────── */
export default function Campaigns() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns', clientId],
    queryFn: () => api.get(`/campaigns?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
    refetchInterval: 20_000,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', clientId],
    queryFn: () => api.get(`/templates?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', clientId],
    queryFn: () => api.get(`/contacts?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black" style={{ color: '#1a1d2e' }}>Campaigns</h2>
          <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>{campaigns.length} total campaigns</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
          style={{ background: '#6366f1', fontFamily: 'inherit' }}>
          + New Campaign
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden"
        style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8eaf0' }}>
                {['Campaign', 'Template', 'Status', 'Recipients', 'Delivered', 'Read', 'Failed', 'Created'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-bold uppercase tracking-wider"
                    style={{ color: '#9ca3af', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: '#9ca3af' }}>Loading…</td></tr>
              )}
              {!isLoading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <p className="text-3xl mb-2">📣</p>
                    <p className="text-sm" style={{ color: '#9ca3af' }}>No campaigns yet. Launch your first one!</p>
                  </td>
                </tr>
              )}
              {campaigns.map(c => (
                <tr key={c.id}
                  style={{ borderBottom: '1px solid #f0f2f8' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9faff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3">
                    <p className="font-semibold" style={{ color: '#1a1d2e' }}>{c.name}</p>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{c.template_name}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#1a1d2e' }}>{c.total_recipients}</td>
                  <td className="px-4 py-3">
                    <DeliveryBar
                      sent={Number(c.sent_count) || 0}
                      delivered={Number(c.delivered_count) || 0}
                      read={Number(c.read_count) || 0}
                      failed={Number(c.failed_count) || 0}
                      total={Number(c.total_recipients) || 0}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold" style={{ color: '#6366f1' }}>{c.read_count || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: '#ef4444' }}>{c.failed_count || 0}</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#9ca3af' }}>
                    {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          templates={templates}
          contacts={contacts}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['campaigns', clientId] })
          }}
        />
      )}
    </div>
  )
}

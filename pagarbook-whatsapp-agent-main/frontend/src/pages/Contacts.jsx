import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

/* ── helpers ─────────────────────────────────────────── */
function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return { name: obj.name || '', phone: obj.phone || obj.mobile || obj.number || '', tags: obj.tags || '', notes: obj.notes || '' }
  }).filter(c => c.phone)
}

/* ── Tag pill ─────────────────────────────────────────── */
function TagPill({ name, color }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mr-1"
      style={{ background: color + '22', color }}>
      {name}
    </span>
  )
}

/* ── Add/Edit modal ───────────────────────────────────── */
function ContactModal({ contact, onClose, onSave }) {
  const [form, setForm] = useState({
    name:    contact?.name    || '',
    phone:   contact?.phone   || '',
    email:   contact?.email   || '',
    company: contact?.company || '',
    notes:   contact?.notes   || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none"
  const inputStyle = { border: '1px solid #e8eaf0', background: '#f8faff', fontFamily: 'inherit', color: '#1a1d2e' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.4)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
        style={{ border: '1px solid #e8eaf0' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-5" style={{ color: '#1a1d2e' }}>
          {contact ? 'Edit Contact' : 'Add Contact'}
        </h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input placeholder="Full Name"    value={form.name}    onChange={set('name')}    className={inputCls} style={inputStyle} />
          <input placeholder="Phone *"      value={form.phone}   onChange={set('phone')}   className={inputCls} style={inputStyle} required />
          <input placeholder="Email"        value={form.email}   onChange={set('email')}   className={inputCls} style={inputStyle} type="email" />
          <input placeholder="Company"      value={form.company} onChange={set('company')} className={inputCls} style={inputStyle} />
          <textarea placeholder="Notes"     value={form.notes}   onChange={set('notes')}
            rows={2} className={inputCls + " resize-none"} style={inputStyle} />
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
              style={{ background: '#f0f2f8', color: '#6b7280', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
              style={{ background: saving ? '#a5b4fc' : '#6366f1', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Main page ────────────────────────────────────────── */
export default function Contacts() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const fileRef = useRef()

  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(null) // null | 'add' | contact obj
  const [importing, setImporting] = useState(false)

  /* fetch */
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts', clientId],
    queryFn: () => api.get(`/contacts?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  /* mutations */
  const createMutation = useMutation({
    mutationFn: (data) => api.post('/contacts', { client_id: clientId, ...data }),
    onSuccess: () => { toast.success('Contact saved'); qc.invalidateQueries({ queryKey: ['contacts', clientId] }); setModal(null) },
    onError: () => toast.error('Failed to save'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/contacts/${id}`, data),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['contacts', clientId] }); setModal(null) },
    onError: () => toast.error('Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/contacts/${id}?client_id=${clientId}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['contacts', clientId] }) },
    onError: () => toast.error('Failed to delete'),
  })

  const bulkMutation = useMutation({
    mutationFn: (contacts) => api.post('/contacts/bulk', { client_id: clientId, contacts }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.data.imported} contacts`)
      qc.invalidateQueries({ queryKey: ['contacts', clientId] })
    },
    onError: () => toast.error('Import failed'),
  })

  /* handlers */
  const handleSave = async (form) => {
    if (modal?.id) {
      await updateMutation.mutateAsync({ id: modal.id, data: form })
    } else {
      await createMutation.mutateAsync(form)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (parsed.length === 0) { toast.error('No valid contacts found in file'); return }
      await bulkMutation.mutateAsync(parsed)
    } catch { toast.error('Failed to parse CSV') }
    finally { setImporting(false); e.target.value = '' }
  }

  const handleDelete = (id, name) => {
    if (confirm(`Delete ${name || 'this contact'}?`)) deleteMutation.mutate(id)
  }

  /* filter */
  const filtered = contacts.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.name || '').toLowerCase().includes(q) ||
           (c.phone || '').includes(q) ||
           (c.email || '').toLowerCase().includes(q) ||
           (c.company || '').toLowerCase().includes(q)
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
          <h2 className="text-2xl font-black" style={{ color: '#1a1d2e' }}>Contacts</h2>
          <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
            {contacts.length} total · {filtered.length} shown
          </p>
        </div>
        <div className="flex gap-3">
          {/* CSV Import */}
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
            style={{ background: '#f0f2f8', color: '#6b7280', fontFamily: 'inherit' }}>
            {importing ? '⏳ Importing…' : '📥 Import CSV'}
          </button>
          <button
            onClick={() => setModal('add')}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
            style={{ background: '#6366f1', fontFamily: 'inherit' }}>
            + Add Contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl mb-4 px-4 py-3 flex items-center gap-3"
        style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
        <span style={{ color: '#9ca3af' }}>🔍</span>
        <input
          type="text"
          placeholder="Search by name, phone, email or company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none bg-transparent"
          style={{ border: 'none', fontFamily: 'inherit', color: '#1a1d2e' }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="text-xs border-none bg-transparent cursor-pointer"
            style={{ color: '#9ca3af' }}>✕</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden"
        style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8eaf0' }}>
                {['Name', 'Phone', 'Email', 'Company', 'Tags', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-bold uppercase tracking-wider"
                    style={{ color: '#9ca3af', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: '#9ca3af' }}>Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <p className="text-3xl mb-2">👥</p>
                    <p className="text-sm" style={{ color: '#9ca3af' }}>
                      {search ? 'No contacts match your search' : 'No contacts yet. Add one or import CSV.'}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} className="transition-colors"
                  style={{ borderBottom: '1px solid #f0f2f8' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9faff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#06b6d4)' }}>
                        {(c.name || c.phone)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="font-semibold" style={{ color: '#1a1d2e' }}>{c.name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#6b7280' }}>{c.phone}</td>
                  <td className="px-4 py-3" style={{ color: '#6b7280' }}>{c.email || '—'}</td>
                  <td className="px-4 py-3" style={{ color: '#6b7280' }}>{c.company || '—'}</td>
                  <td className="px-4 py-3">
                    {Array.isArray(c.tags)
                      ? c.tags.map(t => <TagPill key={t.id || t.name} name={t.name} color={t.color || '#6366f1'} />)
                      : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setModal(c)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold border-none cursor-pointer"
                        style={{ background: 'rgba(99,102,241,.1)', color: '#6366f1', fontFamily: 'inherit' }}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(c.id, c.name)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold border-none cursor-pointer"
                        style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', fontFamily: 'inherit' }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV hint */}
      <p className="text-xs mt-3" style={{ color: '#9ca3af' }}>
        💡 CSV format: <code style={{ background: '#f0f2f8', padding: '1px 6px', borderRadius: 4 }}>name, phone, tags, notes</code>
      </p>

      {/* Modal */}
      {modal && (
        <ContactModal
          contact={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

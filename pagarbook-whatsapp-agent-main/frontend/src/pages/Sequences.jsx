import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

function SequenceModal({ sequence, onClose, onSaved }) {
  const { clientId } = useAuthStore()
  const [form, setForm] = useState({
    name:      sequence?.name      || '',
    is_active: sequence?.is_active ?? true,
    steps:     sequence?.steps     || [],
  })
  const [saving, setSaving] = useState(false)

  const addStep = () => setForm(f=>({ ...f, steps:[...f.steps, { delay_hours:24, message:'' }] }))
  const removeStep = i => setForm(f=>({ ...f, steps:f.steps.filter((_,j)=>j!==i) }))
  const updateStep = (i,k,v) => { const s=[...form.steps]; s[i]={...s[i],[k]:v}; setForm(f=>({...f,steps:s})) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.steps.length===0) { toast.error('Add at least 1 step'); return }
    setSaving(true)
    try {
      if (sequence?.id) await api.put(`/sequences/${sequence.id}`, { name:form.name, steps:form.steps, is_active:form.is_active })
      else await api.post('/sequences', { client_id:clientId, name:form.name, steps:form.steps, is_active:form.is_active })
      toast.success(sequence?.id?'Updated':'Created')
      onSaved()
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto" style={{ maxHeight:'90vh', border:'1px solid #e8eaf0' }} onClick={e=>e.stopPropagation()}>
        <h3 className="text-base font-bold mb-5" style={{ color:'#1a1d2e' }}>{sequence?'Edit Sequence':'New Follow-up Sequence'}</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Sequence Name *</label>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. New Lead Follow-up" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inpStyle} required />
          </div>
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color:'#6b7280' }}>Steps ({form.steps.length})</label>
            <div className="flex flex-col gap-3">
              {form.steps.map((step,i)=>(
                <div key={i} className="rounded-xl p-3" style={{ border:'1px solid #e8eaf0', background:'#f8faff' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background:'#6366f1' }}>{i+1}</span>
                    <span className="text-xs font-semibold" style={{ color:'#6b7280' }}>Step {i+1}</span>
                    <button type="button" onClick={()=>removeStep(i)} className="ml-auto text-xs border-none bg-transparent cursor-pointer" style={{ color:'#ef4444' }}>✕ Remove</button>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs font-bold flex-shrink-0" style={{ color:'#6b7280' }}>Wait</label>
                    <input type="number" min="1" value={step.delay_hours} onChange={e=>updateStep(i,'delay_hours',Number(e.target.value))}
                      className="w-20 rounded-lg px-2 py-1.5 text-xs outline-none" style={inpStyle} />
                    <span className="text-xs" style={{ color:'#6b7280' }}>hours, then send:</span>
                  </div>
                  <textarea value={step.message} onChange={e=>updateStep(i,'message',e.target.value)}
                    placeholder="Follow-up message text…" rows={2}
                    className="w-full rounded-lg px-2 py-1.5 text-sm resize-none outline-none" style={inpStyle} />
                </div>
              ))}
              <button type="button" onClick={addStep}
                className="w-full py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
                style={{ background:'rgba(99,102,241,.08)', color:'#6366f1', border:'1px dashed #6366f1', fontFamily:'inherit' }}>
                + Add Step
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative inline-block cursor-pointer" style={{ width:38, height:20 }}>
              <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} style={{ display:'none' }} />
              <span className="absolute inset-0 rounded-full" style={{ background:form.is_active?'#10b981':'#cbd5e1' }}>
                <span className="absolute w-3.5 h-3.5 rounded-full bg-white transition-all" style={{ top:3, left:form.is_active?21:3 }}></span>
              </span>
            </label>
            <span className="text-sm font-medium" style={{ color:'#6b7280' }}>Active</span>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer" style={{ background:'#f0f2f8', color:'#6b7280', fontFamily:'inherit' }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:saving?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
              {saving?'Saving…':'Save Sequence'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EnrollModal({ sequence, contacts, onClose }) {
  const [phones, setPhones] = useState([])
  const [enrolling, setEnrolling] = useState(false)

  const handleEnroll = async () => {
    if (!phones.length) { toast.error('Select at least 1 contact'); return }
    setEnrolling(true)
    try {
      const { data } = await api.post(`/sequences/${sequence.id}/enroll`, { phones })
      toast.success(`Enrolled ${data.enrolled} contacts`)
      onClose()
    } catch { toast.error('Enroll failed') }
    finally { setEnrolling(false) }
  }

  const toggle = phone => setPhones(prev => prev.includes(phone) ? prev.filter(p=>p!==phone) : [...prev, phone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{ border:'1px solid #e8eaf0' }} onClick={e=>e.stopPropagation()}>
        <h3 className="text-base font-bold mb-2" style={{ color:'#1a1d2e' }}>Enroll in "{sequence.name}"</h3>
        <p className="text-xs mb-4" style={{ color:'#9ca3af' }}>Select contacts to enroll ({phones.length} selected)</p>
        <div className="overflow-y-auto mb-4" style={{ maxHeight:240 }}>
          {contacts.length===0 && <p className="text-sm text-center py-4" style={{ color:'#9ca3af' }}>No contacts available</p>}
          {contacts.map(c=>(
            <label key={c.id} className="flex items-center gap-3 py-2 cursor-pointer" style={{ borderBottom:'1px solid #f0f2f8' }}>
              <input type="checkbox" checked={phones.includes(c.phone)} onChange={()=>toggle(c.phone)} />
              <div>
                <p className="text-sm font-semibold" style={{ color:'#1a1d2e' }}>{c.name||c.phone}</p>
                <p className="text-xs" style={{ color:'#9ca3af' }}>{c.phone}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer" style={{ background:'#f0f2f8', color:'#6b7280', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={handleEnroll} disabled={enrolling||!phones.length} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:enrolling||!phones.length?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
            {enrolling?'Enrolling…':`Enroll ${phones.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Sequences() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [enrollFor, setEnrollFor] = useState(null)

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ['sequences', clientId],
    queryFn: () => api.get(`/sequences?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', clientId],
    queryFn: () => api.get(`/contacts?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/sequences/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey:['sequences',clientId] }) },
  })

  if (!clientId) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center"><p className="text-4xl mb-3">👈</p><p className="font-semibold" style={{ color:'#1a1d2e' }}>Select a client</p></div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Sequences</h2>
          <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>Automated follow-up message drips</p>
        </div>
        <button onClick={()=>setModal({})} className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:'#6366f1', fontFamily:'inherit' }}>
          + New Sequence
        </button>
      </div>

      {isLoading ? <div className="text-center py-16 text-sm" style={{ color:'#9ca3af' }}>Loading…</div>
      : sequences.length===0 ? (
        <div className="text-center py-16"><p className="text-3xl mb-2">🔁</p><p className="text-sm" style={{ color:'#9ca3af' }}>No sequences yet</p></div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))' }}>
          {sequences.map(s=>(
            <div key={s.id} className="bg-white rounded-2xl p-5" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
              <div className="flex items-start justify-between mb-3">
                <p className="font-bold text-sm" style={{ color:'#1a1d2e' }}>{s.name}</p>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
                  style={{ background:s.is_active?'rgba(16,185,129,.1)':'rgba(107,114,128,.1)', color:s.is_active?'#10b981':'#6b7280' }}>
                  {s.is_active?'Active':'Off'}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 mb-4">
                {(s.steps||[]).slice(0,3).map((step,i)=>(
                  <div key={i} className="flex items-center gap-2 text-xs" style={{ color:'#6b7280' }}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background:'#6366f1', fontSize:9 }}>{i+1}</span>
                    <span>After {step.delay_hours}h: {(step.message||'').slice(0,45)}{(step.message||'').length>45?'…':''}</span>
                  </div>
                ))}
                {(s.steps||[]).length>3 && <p className="text-xs" style={{ color:'#9ca3af' }}>+{s.steps.length-3} more steps</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setEnrollFor(s)} className="flex-1 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background:'rgba(16,185,129,.1)', color:'#10b981', fontFamily:'inherit' }}>👥 Enroll</button>
                <button onClick={()=>setModal(s)} className="flex-1 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background:'rgba(99,102,241,.1)', color:'#6366f1', fontFamily:'inherit' }}>✏️ Edit</button>
                <button onClick={()=>{ if(confirm('Delete?')) deleteMutation.mutate(s.id) }} className="px-3 py-2 rounded-lg text-xs border-none cursor-pointer" style={{ background:'rgba(239,68,68,.1)', color:'#ef4444', fontFamily:'inherit' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <SequenceModal sequence={Object.keys(modal).length?modal:null} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); qc.invalidateQueries({ queryKey:['sequences',clientId] }) }} />}
      {enrollFor && <EnrollModal sequence={enrollFor} contacts={contacts} onClose={()=>setEnrollFor(null)} />}
    </div>
  )
}

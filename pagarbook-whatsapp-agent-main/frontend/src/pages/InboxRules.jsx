import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

const TRIGGER_TYPES = ['keyword','contains','starts_with','first_message','unsubscribe']
const ACTION_TYPES  = ['assign_agent','add_tag','send_reply','pause_bot','close_conversation','send_webhook']

function RuleModal({ rule, onClose, onSaved }) {
  const { clientId } = useAuthStore()
  const [form, setForm] = useState({
    name:          rule?.name         || '',
    trigger_type:  rule?.trigger_type || 'keyword',
    trigger_value: rule?.trigger_value?.value || '',
    actions:       rule?.actions      || [],
    priority:      rule?.priority     ?? 0,
    is_active:     rule?.is_active    ?? true,
  })
  const [saving, setSaving] = useState(false)

  const addAction = () => setForm(f => ({ ...f, actions: [...f.actions, { type:'add_tag', value:'' }] }))
  const removeAction = i => setForm(f => ({ ...f, actions: f.actions.filter((_,j)=>j!==i) }))
  const updateAction = (i, key, val) => {
    const acts = [...form.actions]
    acts[i] = { ...acts[i], [key]: val }
    setForm(f => ({ ...f, actions: acts }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        client_id:     clientId,
        name:          form.name,
        trigger_type:  form.trigger_type,
        trigger_value: { value: form.trigger_value },
        actions:       form.actions,
        priority:      Number(form.priority),
        is_active:     form.is_active,
      }
      if (rule?.id) await api.put(`/inbox-rules/${rule.id}`, payload)
      else await api.post('/inbox-rules', payload)
      toast.success(rule?.id ? 'Rule updated' : 'Rule created')
      onSaved()
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const inp = "w-full rounded-lg px-3 py-2 text-sm outline-none"
  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto" style={{ maxHeight:'88vh', border:'1px solid #e8eaf0' }} onClick={e=>e.stopPropagation()}>
        <h3 className="text-base font-bold mb-5" style={{ color:'#1a1d2e' }}>{rule ? 'Edit Rule' : 'New Inbox Rule'}</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Rule Name *</label>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Auto-assign price queries" className={inp} style={inpStyle} required />
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Trigger Type</label>
              <select value={form.trigger_type} onChange={e=>setForm(f=>({...f,trigger_type:e.target.value}))} className={inp} style={inpStyle}>
                {TRIGGER_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Trigger Value</label>
              <input value={form.trigger_value} onChange={e=>setForm(f=>({...f,trigger_value:e.target.value}))}
                placeholder={form.trigger_type==='keyword'?'e.g. price':'e.g. demo'} className={inp} style={inpStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color:'#6b7280' }}>Actions</label>
            <div className="flex flex-col gap-2">
              {form.actions.map((act, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={act.type} onChange={e=>updateAction(i,'type',e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-xs outline-none"
                    style={{ border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e', width:150 }}>
                    {ACTION_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                  <input value={act.value||''} onChange={e=>updateAction(i,'value',e.target.value)}
                    placeholder="value" className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none"
                    style={{ border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit' }} />
                  <button type="button" onClick={()=>removeAction(i)} className="text-xs border-none bg-transparent cursor-pointer" style={{ color:'#ef4444' }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={addAction}
                className="w-full py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
                style={{ background:'rgba(99,102,241,.08)', color:'#6366f1', border:'1px dashed #6366f1', fontFamily:'inherit' }}>
                + Add Action
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Priority (higher = runs first)</label>
              <input type="number" min="0" max="100" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} className={inp} style={inpStyle} />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <label className="relative inline-block cursor-pointer" style={{ width:38, height:20 }}>
                <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} style={{ display:'none' }} />
                <span className="absolute inset-0 rounded-full transition-all" style={{ background:form.is_active?'#10b981':'#cbd5e1' }}>
                  <span className="absolute w-3.5 h-3.5 rounded-full bg-white transition-all" style={{ top:3, left:form.is_active?21:3 }}></span>
                </span>
              </label>
              <span className="text-sm font-medium" style={{ color:'#6b7280' }}>Active</span>
            </div>
          </div>
          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer" style={{ background:'#f0f2f8', color:'#6b7280', fontFamily:'inherit' }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:saving?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
              {saving?'Saving…':'Save Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function InboxRules() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['inbox-rules', clientId],
    queryFn: () => api.get(`/inbox-rules?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/inbox-rules/${id}`),
    onSuccess: () => { toast.success('Rule deleted'); qc.invalidateQueries({ queryKey:['inbox-rules',clientId] }) },
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
          <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Inbox Rules</h2>
          <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>Auto-route and act on incoming messages by trigger</p>
        </div>
        <button onClick={()=>setModal({})} className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:'#6366f1', fontFamily:'inherit' }}>
          + New Rule
        </button>
      </div>

      {isLoading ? <div className="text-center py-16 text-sm" style={{ color:'#9ca3af' }}>Loading…</div>
      : rules.length===0 ? (
        <div className="text-center py-16"><p className="text-3xl mb-2">📬</p><p className="text-sm" style={{ color:'#9ca3af' }}>No inbox rules yet</p></div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
          <table className="w-full" style={{ borderCollapse:'collapse', fontSize:13.5 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #e8eaf0' }}>
                {['Rule Name','Trigger','Actions','Priority','Status',''].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-bold uppercase tracking-wider" style={{ color:'#9ca3af', fontSize:11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid #f0f2f8' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f9faff'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td className="px-4 py-3 font-semibold" style={{ color:'#1a1d2e' }}>{r.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background:'rgba(99,102,241,.1)', color:'#6366f1' }}>{r.trigger_type}</span>
                    {r.trigger_value?.value && <span className="text-xs ml-1" style={{ color:'#9ca3af' }}>"{r.trigger_value.value}"</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(r.actions||[]).map((a,i)=>(
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded mr-1" style={{ background:'#f0f2f8', color:'#6b7280' }}>{a.type}</span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color:'#1a1d2e' }}>{r.priority}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2.5 py-1 rounded-lg font-bold"
                      style={{ background: r.is_active?'rgba(16,185,129,.1)':'rgba(107,114,128,.1)', color: r.is_active?'#10b981':'#6b7280' }}>
                      {r.is_active?'Active':'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={()=>setModal(r)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background:'rgba(99,102,241,.1)', color:'#6366f1', fontFamily:'inherit' }}>Edit</button>
                      <button onClick={()=>{ if(confirm('Delete?')) deleteMutation.mutate(r.id) }} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background:'rgba(239,68,68,.1)', color:'#ef4444', fontFamily:'inherit' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <RuleModal rule={Object.keys(modal).length?modal:null} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); qc.invalidateQueries({ queryKey:['inbox-rules',clientId] }) }} />}
    </div>
  )
}

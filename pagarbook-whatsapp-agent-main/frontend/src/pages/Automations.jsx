import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

const TRIGGER_TYPES = ['keyword','new_contact','first_inbound_message','opt_in','opt_out']
const STEP_TYPES    = ['send_message','add_tag','remove_tag','wait','assign_conversation','close_conversation','create_deal','send_webhook']

function StepEditor({ steps, onChange }) {
  const addStep = () => onChange([...steps, { step_type:'send_message', step_config:{ message:'' } }])
  const removeStep = i => onChange(steps.filter((_,j)=>j!==i))
  const updateStep = (i, key, val) => {
    const s = [...steps]
    s[i] = { ...s[i], step_config: { ...s[i].step_config, [key]: val } }
    onChange(s)
  }
  const updateType = (i, step_type) => {
    const s = [...steps]
    s[i] = { step_type, step_config:{} }
    onChange(s)
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <div key={i} className="rounded-xl p-3" style={{ border:'1px solid #e8eaf0', background:'#f8faff' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background:'#6366f1' }}>{i+1}</span>
            <select value={step.step_type} onChange={e=>updateType(i,e.target.value)}
              className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none"
              style={{ border:'1px solid #e8eaf0', background:'#fff', fontFamily:'inherit', color:'#1a1d2e' }}>
              {STEP_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
            <button onClick={()=>removeStep(i)} className="text-xs border-none bg-transparent cursor-pointer" style={{ color:'#ef4444' }}>✕</button>
          </div>
          {step.step_type==='send_message' && (
            <textarea value={step.step_config?.message||''} onChange={e=>updateStep(i,'message',e.target.value)}
              placeholder="Message text…" rows={2} className="w-full rounded-lg px-2 py-1.5 text-xs resize-none outline-none"
              style={{ border:'1px solid #e8eaf0', background:'#fff', fontFamily:'inherit' }} />
          )}
          {(step.step_type==='add_tag'||step.step_type==='remove_tag') && (
            <input value={step.step_config?.tag||''} onChange={e=>updateStep(i,'tag',e.target.value)}
              placeholder="Tag name" className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              style={{ border:'1px solid #e8eaf0', background:'#fff', fontFamily:'inherit' }} />
          )}
          {step.step_type==='wait' && (
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={step.step_config?.hours||24} onChange={e=>updateStep(i,'hours',Number(e.target.value))}
                className="w-20 rounded-lg px-2 py-1.5 text-xs outline-none"
                style={{ border:'1px solid #e8eaf0', background:'#fff', fontFamily:'inherit' }} />
              <span className="text-xs" style={{ color:'#6b7280' }}>hours</span>
            </div>
          )}
          {step.step_type==='send_webhook' && (
            <input value={step.step_config?.url||''} onChange={e=>updateStep(i,'url',e.target.value)}
              placeholder="https://webhook.url" className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              style={{ border:'1px solid #e8eaf0', background:'#fff', fontFamily:'inherit' }} />
          )}
        </div>
      ))}
      <button onClick={addStep} className="w-full py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
        style={{ background:'rgba(99,102,241,.08)', color:'#6366f1', border:'1px dashed #6366f1', fontFamily:'inherit' }}>
        + Add Step
      </button>
    </div>
  )
}

function AutomationModal({ automation, onClose, onSaved }) {
  const { clientId } = useAuthStore()
  const [form, setForm] = useState({
    name:           automation?.name        || '',
    description:    automation?.description || '',
    trigger_type:   automation?.trigger_type|| 'keyword',
    trigger_keyword:automation?.trigger_config?.keyword || '',
    is_active:      automation?.is_active   ?? true,
    steps:          automation?.steps       || [],
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        client_id:     clientId,
        name:          form.name,
        description:   form.description,
        trigger_type:  form.trigger_type,
        trigger_config:form.trigger_type==='keyword'?{ keyword:form.trigger_keyword }:{},
        is_active:     form.is_active,
        steps:         form.steps,
      }
      if (automation?.id) await api.put(`/automations/${automation.id}`, payload)
      else await api.post('/automations', payload)
      toast.success(automation?.id ? 'Updated' : 'Created')
      onSaved()
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const inp = "w-full rounded-lg px-3 py-2.5 text-sm outline-none"
  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto" style={{ maxHeight:'90vh', border:'1px solid #e8eaf0' }} onClick={e=>e.stopPropagation()}>
        <h3 className="text-base font-bold mb-5" style={{ color:'#1a1d2e' }}>{automation ? 'Edit Automation' : 'New Automation'}</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input value={form.name} onChange={set('name')} placeholder="Automation name *" className={inp} style={inpStyle} required />
          <input value={form.description} onChange={set('description')} placeholder="Description (optional)" className={inp} style={inpStyle} />
          <div className="grid gap-3" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Trigger</label>
              <select value={form.trigger_type} onChange={set('trigger_type')} className={inp} style={inpStyle}>
                {TRIGGER_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            {form.trigger_type==='keyword' && (
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Keyword</label>
                <input value={form.trigger_keyword} onChange={set('trigger_keyword')} placeholder="e.g. hello" className={inp} style={inpStyle} />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color:'#6b7280' }}>Steps</label>
            <StepEditor steps={form.steps} onChange={steps=>setForm(f=>({...f,steps}))} />
          </div>
          <div className="flex items-center gap-3">
            <label className="relative inline-block" style={{ width:42, height:22 }}>
              <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} style={{ display:'none' }} />
              <span onClick={()=>setForm(f=>({...f,is_active:!f.is_active}))} className="absolute inset-0 rounded-full cursor-pointer transition-all"
                style={{ background: form.is_active ? '#10b981' : '#cbd5e1' }}>
                <span className="absolute w-4 h-4 rounded-full bg-white transition-all"
                  style={{ top:3, left: form.is_active?22:3 }}></span>
              </span>
            </label>
            <span className="text-sm font-medium" style={{ color:'#6b7280' }}>Active</span>
          </div>
          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer" style={{ background:'#f0f2f8', color:'#6b7280', fontFamily:'inherit' }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background: saving?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
              {saving ? 'Saving…' : 'Save Automation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Automations() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['automations', clientId],
    queryFn: () => api.get(`/automations?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.patch(`/automations/${id}/toggle`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey:['automations',clientId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/automations/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey:['automations',clientId] }) },
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
          <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Automations</h2>
          <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>Trigger-based automated responses</p>
        </div>
        <button onClick={() => setModal({})} className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:'#6366f1', fontFamily:'inherit' }}>
          + New Automation
        </button>
      </div>

      {isLoading ? <div className="text-center py-16 text-sm" style={{ color:'#9ca3af' }}>Loading…</div>
      : automations.length === 0 ? (
        <div className="text-center py-16"><p className="text-3xl mb-2">⚡</p><p className="text-sm" style={{ color:'#9ca3af' }}>No automations yet</p></div>
      ) : (
        <div className="flex flex-col gap-3">
          {automations.map(a => (
            <div key={a.id} className="bg-white rounded-2xl px-5 py-4 flex items-center gap-4" style={{ border:'1px solid #e8eaf0', boxShadow:'0 2px 12px rgba(0,0,0,.04)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-bold text-sm" style={{ color:'#1a1d2e' }}>{a.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:'rgba(99,102,241,.1)', color:'#6366f1' }}>{a.trigger_type}</span>
                  {a.trigger_config?.keyword && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:'#f0f2f8', color:'#6b7280' }}>"{a.trigger_config.keyword}"</span>}
                </div>
                {a.description && <p className="text-xs" style={{ color:'#9ca3af' }}>{a.description}</p>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs" style={{ color:'#9ca3af' }}>{(a.steps||[]).length} steps</span>
                {/* Toggle */}
                <label className="relative inline-block cursor-pointer" style={{ width:38, height:20 }}>
                  <input type="checkbox" checked={!!a.is_active} onChange={e=>toggleMutation.mutate({ id:a.id, is_active:e.target.checked })} style={{ display:'none' }} />
                  <span className="absolute inset-0 rounded-full transition-all" style={{ background: a.is_active?'#10b981':'#cbd5e1' }}>
                    <span className="absolute w-3.5 h-3.5 rounded-full bg-white transition-all" style={{ top:3, left: a.is_active?21:3 }}></span>
                  </span>
                </label>
                <button onClick={()=>api.get(`/automations/${a.id}`).then(r=>setModal(r.data))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background:'rgba(99,102,241,.1)', color:'#6366f1', fontFamily:'inherit' }}>Edit</button>
                <button onClick={()=>{ if(confirm('Delete?')) deleteMutation.mutate(a.id) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background:'rgba(239,68,68,.1)', color:'#ef4444', fontFamily:'inherit' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <AutomationModal automation={Object.keys(modal).length ? modal : null} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); qc.invalidateQueries({ queryKey:['automations',clientId] }) }} />}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

const STAGES = [
  { id:'new',        label:'New',       color:'#6366f1' },
  { id:'contacted',  label:'Contacted', color:'#06b6d4' },
  { id:'qualified',  label:'Qualified', color:'#f59e0b' },
  { id:'proposal',   label:'Proposal',  color:'#8b5cf6' },
  { id:'won',        label:'Won',       color:'#10b981' },
  { id:'lost',       label:'Lost',      color:'#ef4444' },
]

const PRIORITIES = ['low','medium','high']

function LeadModal({ lead, agents, onClose, onSaved }) {
  const { clientId } = useAuthStore()
  const [form, setForm] = useState({
    title:             lead?.title             || '',
    contact_phone:     lead?.contact_phone     || '',
    stage:             lead?.stage             || 'new',
    value:             lead?.value             || '',
    priority:          lead?.priority          || 'medium',
    notes:             lead?.notes             || '',
    follow_up_at:      lead?.follow_up_at      ? lead.follow_up_at.slice(0,10) : '',
    assigned_agent_id: lead?.assigned_agent_id || '',
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, value: form.value||null, follow_up_at: form.follow_up_at||null, assigned_agent_id: form.assigned_agent_id||null }
      if (lead?.id) await api.patch(`/leads/${lead.id}`, payload)
      else await api.post('/leads', { client_id: clientId, ...payload })
      toast.success(lead?.id?'Updated':'Lead created')
      onSaved()
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const inp = "w-full rounded-lg px-3 py-2 text-sm outline-none"
  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto" style={{ maxHeight:'90vh', border:'1px solid #e8eaf0' }} onClick={e=>e.stopPropagation()}>
        <h3 className="text-base font-bold mb-5" style={{ color:'#1a1d2e' }}>{lead?'Edit Lead':'New Lead'}</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input value={form.title} onChange={set('title')} placeholder="Lead title *" className={inp} style={inpStyle} required />
          <input value={form.contact_phone} onChange={set('contact_phone')} placeholder="Contact phone" className={inp} style={inpStyle} />
          <div className="grid gap-3" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Stage</label>
              <select value={form.stage} onChange={set('stage')} className={inp} style={inpStyle}>
                {STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Priority</label>
              <select value={form.priority} onChange={set('priority')} className={inp} style={inpStyle}>
                {PRIORITIES.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Value (₹)</label>
              <input type="number" value={form.value} onChange={set('value')} placeholder="0" className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Follow-up Date</label>
              <input type="date" value={form.follow_up_at} onChange={set('follow_up_at')} className={inp} style={inpStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Assign Agent</label>
            <select value={form.assigned_agent_id} onChange={set('assigned_agent_id')} className={inp} style={inpStyle}>
              <option value="">Unassigned</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <textarea value={form.notes} onChange={set('notes')} placeholder="Notes…" rows={2} className={inp + " resize-none"} style={inpStyle} />
          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer" style={{ background:'#f0f2f8', color:'#6b7280', fontFamily:'inherit' }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:saving?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
              {saving?'Saving…':'Save Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const PRIORITY_ICON = { high:'🔴', medium:'🟡', low:'🟢' }

function LeadCard({ lead, onEdit, onDelete, onStageChange }) {
  const [dragging, setDragging] = useState(false)
  const followUp = lead.follow_up_at ? new Date(lead.follow_up_at) : null
  const isOverdue = followUp && followUp < new Date()

  return (
    <div
      draggable
      onDragStart={e=>{ setDragging(true); e.dataTransfer.setData('leadId', lead.id) }}
      onDragEnd={()=>setDragging(false)}
      className="bg-white rounded-xl p-3 mb-2 cursor-grab"
      style={{
        border:'1px solid #e8eaf0',
        boxShadow: dragging?'0 8px 24px rgba(99,102,241,.2)':'0 1px 4px rgba(0,0,0,.06)',
        opacity: dragging?0.6:1,
        transform: dragging?'rotate(2deg)':'none',
        transition:'all .15s',
      }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-sm font-semibold leading-tight" style={{ color:'#1a1d2e', maxWidth:140 }}>{lead.title}</p>
        <span className="text-sm">{PRIORITY_ICON[lead.priority]||'🟡'}</span>
      </div>
      {lead.contact_phone && <p className="text-xs mb-1" style={{ color:'#9ca3af' }}>📱 {lead.contact_phone}</p>}
      {lead.value && <p className="text-xs font-bold mb-1" style={{ color:'#10b981' }}>₹{Number(lead.value).toLocaleString('en-IN')}</p>}
      {followUp && (
        <p className="text-xs mb-2" style={{ color: isOverdue?'#ef4444':'#9ca3af' }}>
          {isOverdue?'⚠️ Overdue:':'📅'} {followUp.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
        </p>
      )}
      {lead.agent_name && <p className="text-xs" style={{ color:'#9ca3af' }}>👤 {lead.agent_name}</p>}
      <div className="flex gap-1 mt-2">
        <button onClick={()=>onEdit(lead)} className="flex-1 py-1 rounded text-xs border-none cursor-pointer" style={{ background:'rgba(99,102,241,.1)', color:'#6366f1', fontFamily:'inherit' }}>Edit</button>
        <button onClick={()=>onDelete(lead.id)} className="px-2 py-1 rounded text-xs border-none cursor-pointer" style={{ background:'rgba(239,68,68,.1)', color:'#ef4444', fontFamily:'inherit' }}>✕</button>
      </div>
    </div>
  )
}

export default function Leads() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', clientId],
    queryFn: () => api.get(`/leads?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
    refetchInterval: 30_000,
  })
  const { data: agents = [] } = useQuery({
    queryKey: ['team', clientId],
    queryFn: () => api.get(`/team?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/leads/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey:['leads',clientId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/leads/${id}`),
    onSuccess: () => { toast.success('Lead deleted'); qc.invalidateQueries({ queryKey:['leads',clientId] }) },
  })

  const handleDrop = (e, stageId) => {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('leadId')
    if (leadId) patchMutation.mutate({ id: leadId, data:{ stage: stageId } })
  }

  const totalValue = leads.reduce((sum,l) => sum + (Number(l.value)||0), 0)

  if (!clientId) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center"><p className="text-4xl mb-3">👈</p><p className="font-semibold" style={{ color:'#1a1d2e' }}>Select a client</p></div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Leads</h2>
          <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>
            {leads.length} leads · Pipeline value: <strong style={{ color:'#10b981' }}>₹{totalValue.toLocaleString('en-IN')}</strong>
          </p>
        </div>
        <button onClick={()=>setModal({})} className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white" style={{ background:'#6366f1', fontFamily:'inherit' }}>
          + Add Lead
        </button>
      </div>

      {isLoading ? <div className="text-center py-16 text-sm" style={{ color:'#9ca3af' }}>Loading…</div> : (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight:'calc(100vh - 220px)' }}>
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage.id)
            const stageValue = stageLeads.reduce((s,l)=>s+(Number(l.value)||0),0)
            return (
              <div key={stage.id}
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>handleDrop(e,stage.id)}
                className="flex flex-col rounded-2xl p-3"
                style={{ minWidth:220, width:220, background:'#f8faff', border:`1px solid ${stage.color}22`, flexShrink:0, minHeight:300 }}>
                {/* Column header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background:stage.color }}></span>
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color:stage.color }}>{stage.label}</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background:stage.color }}>
                    {stageLeads.length}
                  </span>
                </div>
                {stageValue>0 && <p className="text-xs mb-2 font-semibold" style={{ color:'#9ca3af' }}>₹{stageValue.toLocaleString('en-IN')}</p>}
                {/* Cards */}
                <div className="flex-1">
                  {stageLeads.map(lead=>(
                    <LeadCard key={lead.id} lead={lead}
                      onEdit={l=>setModal(l)}
                      onDelete={id=>{ if(confirm('Delete lead?')) deleteMutation.mutate(id) }}
                      onStageChange={(id,s)=>patchMutation.mutate({ id, data:{stage:s} })}
                    />
                  ))}
                  {stageLeads.length===0 && (
                    <div className="flex items-center justify-center h-16 rounded-xl text-xs" style={{ color:'#d1d5db', border:'1px dashed #e8eaf0' }}>
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && <LeadModal lead={Object.keys(modal).length?modal:null} agents={agents} onClose={()=>setModal(null)} onSaved={()=>{ setModal(null); qc.invalidateQueries({ queryKey:['leads',clientId] }) }} />}
    </div>
  )
}

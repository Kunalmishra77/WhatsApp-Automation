import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'

const TABS = ['Clients','AI Agent','Team','Documents','Media']

/* ── Clients tab ─────────────────────────────────────── */
function ClientsTab() {
  const qc = useQueryClient()
  const { clientId, setClientId } = useAuthStore()
  const { data: clients = [] } = useQuery({ queryKey:['clients'], queryFn:()=>api.get('/clients').then(r=>r.data) })
  const [form, setForm] = useState({ name:'', phone_number_id:'', whatsapp_business_id:'', app_id:'', app_secret:'', system_access_token:'', webhook_verify_token:'' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const inp = "w-full rounded-lg px-3 py-2 text-sm outline-none"
  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.post('/clients', form)
      toast.success(`Client "${form.name}" onboarded!`)
      setForm({ name:'', phone_number_id:'', whatsapp_business_id:'', app_id:'', app_secret:'', system_access_token:'', webhook_verify_token:'' })
      qc.invalidateQueries({ queryKey:['clients'] })
    } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
    finally { setSaving(false) }
  }

  const toggleMutation = useMutation({
    mutationFn: ({ phoneId, is_listening }) => api.post(`/clients/${phoneId}/toggle`, { is_listening }),
    onSuccess: () => qc.invalidateQueries({ queryKey:['clients'] }),
  })

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns:'1fr 1fr' }}>
      {/* Existing clients */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color:'#1a1d2e' }}>Active Clients ({clients.length})</h3>
        <div className="flex flex-col gap-2">
          {clients.map(c => (
            <div key={c.id} className="bg-white rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ border:`2px solid ${c.id===clientId?'#6366f1':'#e8eaf0'}`, cursor:'pointer' }}
              onClick={() => setClientId(c.id)}>
              <div>
                <p className="font-semibold text-sm" style={{ color:'#1a1d2e' }}>{c.name}</p>
                <p className="text-xs" style={{ color:'#9ca3af' }}>{c.phone_number_id}</p>
              </div>
              <label className="relative inline-block cursor-pointer" style={{ width:38, height:20 }} onClick={e=>e.stopPropagation()}>
                <input type="checkbox" checked={!!c.is_listening} onChange={e=>toggleMutation.mutate({ phoneId:c.phone_number_id, is_listening:e.target.checked })} style={{ display:'none' }} />
                <span className="absolute inset-0 rounded-full transition-all" style={{ background:c.is_listening?'#10b981':'#cbd5e1' }}>
                  <span className="absolute w-3.5 h-3.5 rounded-full bg-white transition-all" style={{ top:3, left:c.is_listening?21:3 }}></span>
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>
      {/* Add new */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color:'#1a1d2e' }}>Add New Client</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          {[['name','Business Name *'],['phone_number_id','Phone Number ID *'],['whatsapp_business_id','WA Business ID *'],['app_id','App ID *'],['app_secret','App Secret *'],['system_access_token','System Access Token *'],['webhook_verify_token','Webhook Verify Token *']].map(([k,p]) => (
            <input key={k} value={form[k]} onChange={set(k)} placeholder={p} required={p.includes('*')} className={inp} style={inpStyle} />
          ))}
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white mt-1"
            style={{ background:saving?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
            {saving?'Onboarding…':'Onboard Client'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── AI Agent tab ────────────────────────────────────── */
function AIAgentTab() {
  const { clientId } = useAuthStore()
  const { data: agent } = useQuery({
    queryKey: ['ai-agent', clientId],
    queryFn: () => api.get(`/agents?client_id=${clientId}`).then(r => r.data).catch(()=>null),
    enabled: !!clientId,
  })
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const current = form || agent || {}
  const set = k => e => setForm(f=>({ ...(f||agent||{}), [k]: e.target.value }))
  const inp = "w-full rounded-lg px-3 py-2 text-sm outline-none"
  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/agents', { client_id: clientId, ...current })
      toast.success('AI Agent settings saved')
      setForm(null)
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  if (!clientId) return <p className="text-sm" style={{ color:'#9ca3af' }}>Select a client first</p>

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-xl">
      <div>
        <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Agent Name *</label>
        <input value={current.name||''} onChange={set('name')} placeholder="e.g. PagarBook Assistant" className={inp} style={inpStyle} required />
      </div>
      <div>
        <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>System Prompt *</label>
        <textarea value={current.system_prompt||''} onChange={set('system_prompt')} rows={8} placeholder="You are a helpful assistant for PagarBook…" className={inp + " resize-y"} style={{ ...inpStyle, minHeight:180 }} required />
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns:'1fr 1fr' }}>
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Model</label>
          <select value={current.model_name||'gpt-4o-mini'} onChange={set('model_name')} className={inp} style={inpStyle}>
            {['gpt-4o-mini','gpt-4o','gpt-4-turbo'].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Temperature (0-1)</label>
          <input type="number" min="0" max="1" step="0.1" value={current.temperature||0.3} onChange={set('temperature')} className={inp} style={inpStyle} />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Opt-Out Message</label>
        <input value={current.opt_out_message||''} onChange={set('opt_out_message')} placeholder="You've been unsubscribed…" className={inp} style={inpStyle} />
      </div>
      <div>
        <label className="text-xs font-bold block mb-1" style={{ color:'#6b7280' }}>Opt-In Message</label>
        <input value={current.opt_in_message||''} onChange={set('opt_in_message')} placeholder="Welcome back!…" className={inp} style={inpStyle} />
      </div>
      <button type="submit" disabled={saving} className="py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
        style={{ background:saving?'#a5b4fc':'#6366f1', fontFamily:'inherit', maxWidth:200 }}>
        {saving?'Saving…':'Save AI Agent Config'}
      </button>
    </form>
  )
}

/* ── Team tab ────────────────────────────────────────── */
function TeamTab() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const { data: agents = [] } = useQuery({
    queryKey: ['team', clientId],
    queryFn: () => api.get(`/team?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })
  const [form, setForm] = useState({ full_name:'', email:'', password_hash:'', role:'agent' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const inp = "w-full rounded-lg px-3 py-2 text-sm outline-none"
  const inpStyle = { border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit', color:'#1a1d2e' }

  const handleAdd = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/team', { client_id: clientId, ...form })
      toast.success('Agent added')
      setForm({ full_name:'', email:'', password_hash:'', role:'agent' })
      qc.invalidateQueries({ queryKey:['team', clientId] })
    } catch { toast.error('Failed') }
    finally { setSaving(false) }
  }

  if (!clientId) return <p className="text-sm" style={{ color:'#9ca3af' }}>Select a client first</p>

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns:'1fr 1fr' }}>
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color:'#1a1d2e' }}>Team Members ({agents.length})</h3>
        <div className="flex flex-col gap-2">
          {agents.length===0 && <p className="text-sm" style={{ color:'#9ca3af' }}>No agents yet</p>}
          {agents.map(a=>(
            <div key={a.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3" style={{ border:'1px solid #e8eaf0' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background:'linear-gradient(135deg,#6366f1,#06b6d4)' }}>
                {a.full_name?.[0]?.toUpperCase()||'?'}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color:'#1a1d2e' }}>{a.full_name}</p>
                <p className="text-xs" style={{ color:'#9ca3af' }}>{a.email} · {a.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color:'#1a1d2e' }}>Add Agent</h3>
        <form onSubmit={handleAdd} className="flex flex-col gap-2.5">
          <input value={form.full_name} onChange={set('full_name')} placeholder="Full Name *" className={inp} style={inpStyle} required />
          <input type="email" value={form.email} onChange={set('email')} placeholder="Email *" className={inp} style={inpStyle} required />
          <input type="password" value={form.password_hash} onChange={set('password_hash')} placeholder="Password *" className={inp} style={inpStyle} required />
          <select value={form.role} onChange={set('role')} className={inp} style={inpStyle}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
            <option value="supervisor">Supervisor</option>
          </select>
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
            style={{ background:saving?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
            {saving?'Adding…':'Add Agent'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── Documents tab ───────────────────────────────────── */
function DocumentsTab() {
  const { clientId } = useAuthStore()
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data: result } = useQuery({
    queryKey: ['search-docs', clientId, search],
    queryFn: () => search ? api.get(`/search?client_id=${clientId}&q=${encodeURIComponent(search)}`).then(r=>r.data) : [],
    enabled: !!clientId && !!search,
  })

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !clientId) return
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(',')[1]
        await api.post('/upload', { client_id: clientId, file_name: file.name, file_data: base64 })
        toast.success(`"${file.name}" uploaded and vectorizing…`)
      }
      reader.readAsDataURL(file)
    } catch { toast.error('Upload failed') }
    finally { setUploading(false); e.target.value='' }
  }

  if (!clientId) return <p className="text-sm" style={{ color:'#9ca3af' }}>Select a client first</p>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3">
        <input ref={fileRef} type="file" accept=".pdf,.txt,.docx" className="hidden" onChange={handleUpload} />
        <button onClick={()=>fileRef.current?.click()} disabled={uploading}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
          style={{ background:uploading?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
          {uploading?'⏳ Uploading…':'📤 Upload Document (PDF/TXT/DOCX)'}
        </button>
      </div>
      <div className="flex gap-3 items-center">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search knowledge base…"
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{ border:'1px solid #e8eaf0', background:'#f8faff', fontFamily:'inherit' }} />
      </div>
      {search && result && (
        <div className="flex flex-col gap-3">
          {result.length===0
            ? <p className="text-sm" style={{ color:'#9ca3af' }}>No results for "{search}"</p>
            : result.map((r,i) => (
              <div key={i} className="bg-white rounded-xl p-4" style={{ border:'1px solid #e8eaf0' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold" style={{ color:'#6366f1' }}>{r.metadata?.source}</span>
                  <span className="text-xs" style={{ color:'#9ca3af' }}>Similarity: {(r.similarity*100).toFixed(0)}%</span>
                </div>
                <p className="text-sm" style={{ color:'#1a1d2e', lineHeight:1.6 }}>{r.content}</p>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

/* ── Media tab ───────────────────────────────────────── */
function MediaTab() {
  const { clientId } = useAuthStore()
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['media'],
    queryFn: () => api.get('/media').then(r => r.data),
  })
  const files = data?.files || []

  const deleteMutation = useMutation({
    mutationFn: name => api.delete(`/media/${name}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey:['media'] }) },
  })

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(',')[1]
        await api.post('/media/upload', { file_name: file.name, file_data: base64 })
        toast.success('Uploaded!')
        qc.invalidateQueries({ queryKey:['media'] })
      }
      reader.readAsDataURL(file)
    } catch { toast.error('Upload failed') }
    finally { setUploading(false); e.target.value='' }
  }

  const isImage = n => /\.(png|jpg|jpeg|gif|webp)$/i.test(n)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
        <button onClick={()=>fileRef.current?.click()} disabled={uploading}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
          style={{ background:uploading?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
          {uploading?'⏳ Uploading…':'📤 Upload Media'}
        </button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))' }}>
        {files.length===0 && <p className="text-sm" style={{ color:'#9ca3af' }}>No media files yet</p>}
        {files.map(f=>(
          <div key={f.name} className="bg-white rounded-xl overflow-hidden" style={{ border:'1px solid #e8eaf0' }}>
            {isImage(f.name)
              ? <img src={f.url} alt={f.name} className="w-full object-cover" style={{ height:100 }} />
              : <div className="flex items-center justify-center" style={{ height:100, background:'#f8faff' }}>
                  <span className="text-3xl">📄</span>
                </div>
            }
            <div className="p-2">
              <p className="text-xs font-semibold truncate" style={{ color:'#1a1d2e' }}>{f.name}</p>
              <p className="text-xs" style={{ color:'#9ca3af' }}>{f.size}</p>
              <div className="flex gap-1 mt-2">
                <button onClick={()=>navigator.clipboard.writeText(f.url).then(()=>toast.success('URL copied'))}
                  className="flex-1 py-1 rounded text-xs border-none cursor-pointer"
                  style={{ background:'rgba(99,102,241,.1)', color:'#6366f1', fontFamily:'inherit' }}>Copy URL</button>
                <button onClick={()=>{ if(confirm('Delete?')) deleteMutation.mutate(f.name) }}
                  className="px-2 py-1 rounded text-xs border-none cursor-pointer"
                  style={{ background:'rgba(239,68,68,.1)', color:'#ef4444', fontFamily:'inherit' }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main Settings page ──────────────────────────────── */
export default function Settings() {
  const [active, setActive] = useState('Clients')

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Settings</h2>
        <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>Manage clients, AI agent, team, documents, and media</p>
      </div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-2xl p-1.5 w-fit" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
        {TABS.map(t => (
          <button key={t} onClick={()=>setActive(t)}
            className="px-5 py-2 rounded-xl text-sm font-semibold border-none cursor-pointer transition-all"
            style={{ background: active===t?'#6366f1':'transparent', color: active===t?'#fff':'#6b7280', fontFamily:'inherit' }}>
            {t}
          </button>
        ))}
      </div>
      {/* Content */}
      <div className="bg-white rounded-2xl p-6" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
        {active==='Clients'   && <ClientsTab />}
        {active==='AI Agent'  && <AIAgentTab />}
        {active==='Team'      && <TeamTab />}
        {active==='Documents' && <DocumentsTab />}
        {active==='Media'     && <MediaTab />}
      </div>
    </div>
  )
}

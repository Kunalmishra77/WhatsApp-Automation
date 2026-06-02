import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import toast from 'react-hot-toast'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

/* ── Custom nodes ─────────────────────────────────────── */
const nodeColors = {
  trigger:   { bg:'#6366f1', border:'#4f46e5' },
  message:   { bg:'#10b981', border:'#059669' },
  condition: { bg:'#f59e0b', border:'#d97706' },
  wait:      { bg:'#06b6d4', border:'#0891b2' },
  assign:    { bg:'#8b5cf6', border:'#7c3aed' },
  end:       { bg:'#ef4444', border:'#dc2626' },
}

function FlowNode({ data, type }) {
  const c = nodeColors[type] || nodeColors.message
  return (
    <div style={{ background:'#fff', border:`2px solid ${c.border}`, borderRadius:12, padding:'10px 16px', minWidth:160, boxShadow:'0 4px 14px rgba(0,0,0,.1)', fontFamily:'Plus Jakarta Sans,sans-serif' }}>
      {type !== 'trigger' && <Handle type="target" position={Position.Top} style={{ background: c.bg, width:10, height:10 }} />}
      <div className="flex items-center gap-2">
        <span style={{ fontSize:16 }}>
          {type==='trigger'?'⚡':type==='message'?'💬':type==='condition'?'❓':type==='wait'?'⏱️':type==='assign'?'👤':'🔴'}
        </span>
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:0.5 }}>{type}</p>
          <p style={{ fontSize:13, fontWeight:600, color:'#1a1d2e', marginTop:1 }}>{data.label || 'Unnamed'}</p>
        </div>
      </div>
      {type !== 'end' && <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width:10, height:10 }} />}
    </div>
  )
}

const nodeTypes = {
  trigger:   (p) => <FlowNode {...p} type="trigger"   />,
  message:   (p) => <FlowNode {...p} type="message"   />,
  condition: (p) => <FlowNode {...p} type="condition" />,
  wait:      (p) => <FlowNode {...p} type="wait"      />,
  assign:    (p) => <FlowNode {...p} type="assign"    />,
  end:       (p) => <FlowNode {...p} type="end"       />,
}

const INITIAL_NODES = [
  { id:'trigger-1', type:'trigger', position:{ x:250, y:50 },  data:{ label:'Keyword Trigger' } },
  { id:'message-1', type:'message', position:{ x:250, y:180 }, data:{ label:'Send Welcome' } },
]
const INITIAL_EDGES = [
  { id:'e1-2', source:'trigger-1', target:'message-1', type:'smoothstep', animated:true }
]

/* ── Flow Editor ──────────────────────────────────────── */
function FlowEditor({ flow, onClose, onSaved }) {
  const { clientId } = useAuthStore()

  // Convert saved nodes from DB to ReactFlow format
  const initNodes = flow.nodes?.length
    ? flow.nodes.map(n => ({
        id: n.node_key, type: n.node_type,
        position: { x: n.position_x || 0, y: n.position_y || 0 },
        data: n.config || {},
      }))
    : INITIAL_NODES

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [saving, setSaving] = useState(false)

  const onConnect = useCallback(params => setEdges(eds => addEdge({ ...params, type:'smoothstep', animated:true }, eds)), [])

  const addNode = (type) => {
    const id = `${type}-${Date.now()}`
    setNodes(ns => [...ns, {
      id, type,
      position: { x: 150 + Math.random()*200, y: 200 + Math.random()*200 },
      data: { label: type.charAt(0).toUpperCase() + type.slice(1) }
    }])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const rfNodes = nodes.map(n => ({
        node_key: n.id, node_type: n.type,
        config: n.data,
        position_x: Math.round(n.position?.x || 0),
        position_y: Math.round(n.position?.y || 0),
      }))
      await api.post(`/flows/${flow.id}/save`, {
        nodes: rfNodes,
        status: 'active',
        entry_node_id: rfNodes[0]?.node_key,
        trigger_type: flow.trigger_type || 'keyword',
        trigger_config: flow.trigger_config || {},
      })
      toast.success('Flow saved!')
      onSaved()
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const NODE_TYPES_BTN = ['message','condition','wait','assign','end']

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background:'#fff' }}>
      {/* Editor topbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor:'#e8eaf0', background:'#fff' }}>
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background:'#f0f2f8', color:'#6b7280', fontFamily:'inherit' }}>← Back</button>
          <span className="font-bold" style={{ color:'#1a1d2e' }}>{flow.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {NODE_TYPES_BTN.map(t => (
            <button key={t} onClick={() => addNode(t)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
              style={{ background: nodeColors[t]?.bg + '22', color: nodeColors[t]?.border, fontFamily:'inherit' }}>
              + {t}
            </button>
          ))}
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer text-white ml-2"
            style={{ background: saving?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
            {saving ? 'Saving…' : '💾 Save & Activate'}
          </button>
        </div>
      </div>
      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#f0f2f8" gap={20} />
          <Controls />
          <MiniMap nodeColor={n => nodeColors[n.type]?.bg || '#6b7280'} />
        </ReactFlow>
      </div>
    </div>
  )
}

/* ── Flows list page ──────────────────────────────────── */
export default function Flows() {
  const { clientId } = useAuthStore()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows', clientId],
    queryFn: () => api.get(`/flows?client_id=${clientId}`).then(r => r.data),
    enabled: !!clientId,
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/flows', { client_id: clientId, name:`New Flow ${Date.now()}`, trigger_type:'keyword' }),
    onSuccess: async (r) => {
      const full = await api.get(`/flows/${r.data.id}`)
      setEditing(full.data)
      qc.invalidateQueries({ queryKey:['flows',clientId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/flows/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey:['flows',clientId] }) },
  })

  const openEditor = async (id) => {
    try {
      const r = await api.get(`/flows/${id}`)
      setEditing(r.data)
    } catch { toast.error('Failed to open flow') }
  }

  if (!clientId) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center"><p className="text-4xl mb-3">👈</p><p className="font-semibold" style={{ color:'#1a1d2e' }}>Select a client</p></div>
    </div>
  )

  if (editing) return (
    <FlowEditor flow={editing} onClose={()=>setEditing(null)} onSaved={()=>{ setEditing(null); qc.invalidateQueries({ queryKey:['flows',clientId] }) }} />
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black" style={{ color:'#1a1d2e' }}>Flows</h2>
          <p className="text-sm mt-0.5" style={{ color:'#9ca3af' }}>Visual chatbot flow builder</p>
        </div>
        <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer text-white"
          style={{ background: createMutation.isPending?'#a5b4fc':'#6366f1', fontFamily:'inherit' }}>
          {createMutation.isPending ? 'Creating…' : '+ New Flow'}
        </button>
      </div>

      {isLoading ? <div className="text-center py-16 text-sm" style={{ color:'#9ca3af' }}>Loading…</div>
      : flows.length === 0 ? (
        <div className="text-center py-16"><p className="text-3xl mb-2">🔀</p><p className="text-sm" style={{ color:'#9ca3af' }}>No flows yet. Create your first chatbot flow!</p></div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))' }}>
          {flows.map(f => (
            <div key={f.id} className="bg-white rounded-2xl p-5" style={{ border:'1px solid #e8eaf0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-sm" style={{ color:'#1a1d2e' }}>{f.name}</p>
                  <p className="text-xs mt-0.5" style={{ color:'#9ca3af' }}>Trigger: {f.trigger_type}</p>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
                  style={{ background: f.status==='active'?'rgba(16,185,129,.1)':'rgba(107,114,128,.1)', color: f.status==='active'?'#10b981':'#6b7280' }}>
                  {f.status}
                </span>
              </div>
              <p className="text-xs mb-4" style={{ color:'#9ca3af' }}>
                {new Date(f.created_at).toLocaleDateString('en-IN',{ day:'numeric', month:'short', year:'numeric' })}
              </p>
              <div className="flex gap-2">
                <button onClick={() => openEditor(f.id)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer text-white"
                  style={{ background:'#6366f1', fontFamily:'inherit' }}>
                  ✏️ Edit Flow
                </button>
                <button onClick={() => { if(confirm('Delete flow?')) deleteMutation.mutate(f.id) }}
                  className="px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background:'rgba(239,68,68,.1)', color:'#ef4444', fontFamily:'inherit' }}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client';
import { useCallback, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { applyNodeChanges, applyEdgeChanges, addEdge, type NodeChange, type EdgeChange, type Connection } from 'reactflow';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FlowCanvas } from '@/modules/flows/components/FlowCanvas';
import { NodeConfigPanel } from '@/modules/flows/components/NodeConfigPanel';
import { AddNodeToolbar } from '@/modules/flows/components/AddNodeToolbar';
import { useFlow, useUpdateFlow } from '@/modules/flows/hooks/useFlows';
import type { FlowNode, FlowEdge, FlowNodeData } from '@/modules/flows/types';

export default function FlowBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.id as string;

  const { data: flow, isLoading } = useFlow(flowId);
  const updateFlow = useUpdateFlow();

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [flowName, setFlowName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync flow data into local state once loaded
  useEffect(() => {
    if (flow) {
      setNodes((flow.nodes ?? []) as FlowNode[]);
      setEdges((flow.edges ?? []) as FlowEdge[]);
      setFlowName(flow.name);
      setIsActive(flow.is_active);
    }
  }, [flow?.id]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[]);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds) as FlowEdge[]);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(connection, eds) as FlowEdge[]);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleNodeSave = useCallback((nodeId: string, data: FlowNodeData) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data } : n)),
    );
  }, []);

  const handleAddNode = useCallback((node: FlowNode) => {
    setNodes((nds) => [...nds, node]);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateFlow.mutateAsync({
        id: flowId,
        patch: {
          name: flowName,
          is_active: isActive,
          nodes,
          edges,
          trigger_type: (nodes.find((n) => n.type === 'start')?.data as { triggerType?: string })?.triggerType ?? 'keyword',
          trigger_value: (nodes.find((n) => n.type === 'start')?.data as { triggerValue?: string })?.triggerValue ?? null,
        },
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push('/flows')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Input
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          className="max-w-xs h-8 text-sm font-medium"
          placeholder="Flow name"
        />

        <div className="flex items-center gap-2 ml-auto">
          <Label htmlFor="flow-active" className="text-sm text-muted-foreground">Active</Label>
          <Switch
            id="flow-active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Button
            onClick={() => void handleSave()}
            disabled={isSaving}
            size="sm"
            className="gap-2"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* Builder area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <div className="p-3 border-r border-border bg-background flex flex-col gap-2 shrink-0">
          <AddNodeToolbar onAddNode={handleAddNode} />
        </div>

        {/* Canvas */}
        <div className="flex-1 h-full">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
          />
        </div>

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onSave={handleNodeSave}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}

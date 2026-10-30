'use client';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { applyNodeChanges, applyEdgeChanges, addEdge, type NodeChange, type EdgeChange, type Connection } from 'reactflow';
import { ArrowLeft, Save, Loader2, AlertTriangle, X, PlayCircle, List, GitBranch, TrendingDown, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FlowCanvas } from '@/modules/flows/components/FlowCanvas';
import { NodeConfigPanel } from '@/modules/flows/components/NodeConfigPanel';
import { AddNodeToolbar } from '@/modules/flows/components/AddNodeToolbar';
import { FlowSimulator } from '@/modules/flows/components/FlowSimulator';
import { FlowDropoff } from '@/modules/flows/components/FlowDropoff';
import { FlowVersions } from '@/modules/flows/components/FlowVersions';
import { FlowSteps } from '@/modules/flows/components/FlowSteps';
import { toSteps } from '@/lib/flow-steps';
import { describeFlow } from '@/lib/flow-summary';
import { useFlow, useUpdateFlow } from '@/modules/flows/hooks/useFlows';
import { validateFlow, type FlowWarning } from '@/lib/flow-validate';
import { cn } from '@/lib/utils';
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
  // Warnings are withheld until the first Save so a half-wired canvas isn't
  // nagging while it's still being built. After that they stay live and clear
  // themselves as each problem is fixed.
  // Normally the warnings appear after a save, because that is when the author
  // has asked for a verdict. `?review=1` opens with them showing: the AI builder
  // sends a flow nobody wrote by hand, and it deserves to be read before it is
  // switched on.
  const reviewOnOpen = useSearchParams().get('review') === '1';
  const [showWarnings, setShowWarnings] = useState(reviewOnOpen);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  // One side panel at a time. Two of them leave the canvas too narrow to
  // read, which is the point of having a canvas.
  const [dropoffOpen, setDropoffOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // A straight-line flow opens as a list; anything that branches opens on the
  // canvas. Eleven of the eighteen live flows are straight lines, and eight of
  // those are a single auto-reply someone built on a node canvas.
  const [view, setView] = useState<'steps' | 'canvas'>('canvas');
  const [viewChosen, setViewChosen] = useState(false);

  // The checks only the server can make — a trigger another active flow reaches
  // first, a template that no longer exists.
  //
  // Kept with the exact state that was sent, and shown only while the canvas
  // still matches it. A "this flow will never run" left on screen after the
  // author changed the trigger is worse than no warning at all, and comparing
  // by reference is enough: React replaces these arrays on every edit, and
  // handleSave stores the very arrays it posted. Derived rather than cleared in
  // an effect, so an edit cannot cause a second render pass.
  const [lastSave, setLastSave] = useState<{
    warnings: FlowWarning[];
    nodes: FlowNode[];
    edges: FlowEdge[];
    isActive: boolean;
  } | null>(null);

  const localWarnings = useMemo(() => validateFlow(nodes, edges), [nodes, edges]);
  const warnings = useMemo(() => {
    const fresh =
      lastSave && lastSave.nodes === nodes && lastSave.edges === edges && lastSave.isActive === isActive
        ? lastSave.warnings
        : [];
    return [...localWarnings, ...fresh];
  }, [localWarnings, lastSave, nodes, edges, isActive]);
  // Derived from the nodes every time, so it cannot drift from what the flow
  // does. Reading a sentence takes no knowledge of what the shapes mean, and a
  // flow whose steps are in the wrong order reads obviously wrong.
  const summary = useMemo(() => describeFlow(nodes, edges), [nodes, edges]);

  useEffect(() => {
    if (viewChosen || nodes.length === 0) return;
    setView(toSteps(nodes, edges).ok ? 'steps' : 'canvas');
  }, [nodes, edges, viewChosen]);

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

  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  const handleAddNode = useCallback((node: FlowNode) => {
    setNodes((nds) => [...nds, node]);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setShowWarnings(true);
    try {
      const saved = await updateFlow.mutateAsync({
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
      setLastSave({ warnings: saved.warnings, nodes, edges, isActive });
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
          <div className="mr-1 flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => { setView('steps'); setViewChosen(true); }}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                view === 'steps' ? 'bg-muted font-medium' : 'text-muted-foreground',
              )}
            >
              <List className="h-3 w-3" /> Steps
            </button>
            <button
              type="button"
              onClick={() => { setView('canvas'); setViewChosen(true); }}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                view === 'canvas' ? 'bg-muted font-medium' : 'text-muted-foreground',
              )}
            >
              <GitBranch className="h-3 w-3" /> Canvas
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => { setSimulatorOpen((o) => !o); setDropoffOpen(false); setHistoryOpen(false); }}
            title="Run this flow here, without messaging a real number"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Try it
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => { setDropoffOpen((o) => !o); setSimulatorOpen(false); setHistoryOpen(false); }}
            title="See which step customers stop at"
          >
            <TrendingDown className="h-3.5 w-3.5" />
            Drop-off
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => { setHistoryOpen((o) => !o); setSimulatorOpen(false); setDropoffOpen(false); }}
            title="Every saved version of this flow, and a way back to one"
          >
            <History className="h-3.5 w-3.5" />
            History
          </Button>
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

      {/* What this flow does, in a sentence. */}
      {nodes.length > 0 && (
        <div className="shrink-0 border-b border-border bg-card px-4 py-2">
          <p className="text-xs leading-snug text-muted-foreground">{summary}</p>
        </div>
      )}

      {/* Warnings — the flow saves either way; these are the mistakes that make
          a flow look correct in the canvas and misbehave on WhatsApp. */}
      {showWarnings && warnings.length > 0 && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {lastSave
                  ? `Saved, but ${warnings.length === 1 ? 'one thing' : `${warnings.length} things`} will not work the way the canvas suggests`
                  : `${warnings.length === 1 ? 'One thing' : `${warnings.length} things`} will not work the way the canvas suggests`}
              </p>
              <ul className="space-y-1">
                {warnings.map((w, i) => {
                  const label = (nodes.find((n) => n.id === w.nodeId)?.data as { label?: string } | undefined)?.label;
                  return (
                    // Index in the key: a flow can shadow several others, and
                    // every one of those warnings sits on the same start node.
                    <li key={`${w.kind}-${w.nodeId}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(w.nodeId)}
                        className="text-left text-sm text-amber-800 underline-offset-2 hover:underline dark:text-amber-300/90"
                      >
                        {label ? <span className="font-medium">{label}: </span> : null}
                        {w.message}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
              onClick={() => setShowWarnings(false)}
              aria-label="Dismiss warnings"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Builder area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar — the step list has its own "Add a step" row, so the
            node palette only belongs beside the canvas. */}
        {view === 'canvas' && (
          <div className="p-3 border-r border-border bg-background flex flex-col gap-2 shrink-0">
            <AddNodeToolbar onAddNode={handleAddNode} />
          </div>
        )}

        {view === 'steps' && (
          <div className="flex-1 h-full">
            <FlowSteps
              nodes={nodes}
              edges={edges}
              onChange={(n, e) => { setNodes(n); setEdges(e); }}
              onEditStep={setSelectedNodeId}
              onSwitchToCanvas={() => { setView('canvas'); setViewChosen(true); }}
              selectedNodeId={selectedNodeId}
            />
          </div>
        )}

        {/* Canvas */}
        <div className={cn('flex-1 h-full', view !== 'canvas' && 'hidden')}>
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onNodeDelete={handleNodeDelete}
          />
        </div>

        {/* Simulator — reads the nodes and edges in state, so it always runs the
            flow as it is on screen rather than as it was last saved.
            No onVisit is passed: selecting the node each turn would open the
            config panel on top of this one and squeeze the canvas to nothing.
            Each line in the transcript names its node instead. */}
        {simulatorOpen && (
          <FlowSimulator
            nodes={nodes}
            edges={edges}
            onClose={() => setSimulatorOpen(false)}
          />
        )}

        {/* Drop-off — reads saved sessions, so it reports the flow as it has
            actually been running rather than as it is being edited. Selecting a
            step from here is the point: the worst number should take you to the
            message that produced it. */}
        {dropoffOpen && (
          <FlowDropoff
            flowId={flowId}
            onClose={() => setDropoffOpen(false)}
            onSelect={(nodeId) => setSelectedNodeId(nodeId)}
          />
        )}

        {/* History. A restore rewrites the flow row, so the editor has to take
            the new state rather than keep showing what is on screen — the
            canvas would otherwise be an unsaved copy of the version just
            replaced, one Save away from undoing the restore. */}
        {historyOpen && (
          <FlowVersions
            flowId={flowId}
            onClose={() => setHistoryOpen(false)}
            onRestored={() => {
              setSelectedNodeId(null);
              setLastSave(null);
              setHistoryOpen(false);
            }}
          />
        )}

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            allNodes={nodes}
            onSave={handleNodeSave}
            onDelete={handleNodeDelete}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}

'use client';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { StartNode, MessageNode, QuestionNode, ConditionNode, AssignAgentNode, EndNode } from '../nodes';
import type { FlowNode, FlowEdge } from '../../types';

const nodeTypes = {
  start:        StartNode,
  message:      MessageNode,
  question:     QuestionNode,
  condition:    ConditionNode,
  assign_agent: AssignAgentNode,
  end:          EndNode,
};

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onNodeClick: (nodeId: string) => void;
  onNodeDelete?: (nodeId: string) => void;
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onNodeDelete,
}: FlowCanvasProps) {
  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        onNodesDelete={(deleted) => deleted.forEach((n) => onNodeDelete?.(n.id))}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

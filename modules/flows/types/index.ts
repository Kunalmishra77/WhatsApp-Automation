import type { Node, Edge } from 'reactflow';

export type FlowNodeType = 'start' | 'message' | 'question' | 'condition' | 'assign_agent' | 'end';
export type ComparisonOperator = '>=' | '>' | '<' | '<=' | '==' | '!=';

export interface StartNodeData    { label: string; triggerType: 'keyword' | 'first_message'; triggerValue: string; }
export interface MessageNodeData  { label: string; message: string; }
export interface QuestionNodeData { label: string; message: string; timeoutHours: number; saveAsVariable?: string; }
export interface ConditionNodeData {
  label: string;
  conditionType?: 'keyword' | 'variable_compare';
  keyword: string;
  matchType: 'contains' | 'equals' | 'starts_with';
  variable?: string;
  operator?: ComparisonOperator;
  value?: number;
}
export interface AssignAgentNodeData { label: string; message: string; }
export interface EndNodeData      { label: string; message: string; }

export type FlowNodeData =
  | StartNodeData
  | MessageNodeData
  | QuestionNodeData
  | ConditionNodeData
  | AssignAgentNodeData
  | EndNodeData;

export type FlowNode = Node<FlowNodeData, FlowNodeType>;
export type FlowEdge = Edge;

export interface ChatbotFlow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_value: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  created_at: string;
  updated_at: string;
}

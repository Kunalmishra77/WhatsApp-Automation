import type { Node, Edge } from 'reactflow';

export type FlowNodeType =
  | 'start' | 'message' | 'question' | 'condition' | 'assign_agent' | 'end'
  | 'wait' | 'media' | 'action' | 'template' | 'ai_reply' | 'collect';
export type ComparisonOperator = '>=' | '>' | '<' | '<=' | '==' | '!=';

export interface StartNodeData    { label: string; triggerType: 'keyword' | 'first_message'; triggerValue: string; }
export interface MessageNodeData  { label: string; message: string; }
/** One tap-to-answer option. `id` is what the branch edge is keyed on. */
export interface FlowChoice { id: string; title: string; description?: string; }

export interface QuestionNodeData {
  label: string;
  message: string;
  timeoutHours: number;
  saveAsVariable?: string;
  /** How the customer answers. Absent behaves as 'text', or 'buttons' if choices exist. */
  answerMode?: 'text' | 'buttons' | 'list';
  /** Up to 3 for buttons, 10 for a list. Each gets its own outgoing branch. */
  choices?: FlowChoice[];
  /** The label on the button that opens a list. WhatsApp requires one. */
  listButtonText?: string;
  header?: string;
  footer?: string;
  /** Pre-choices flows stored plain titles here. Still honoured. */
  buttons?: string[];
  /** Validation re-ask loops set this so the question always runs. */
  forceAsk?: boolean;
}
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

export interface WaitNodeData {
  label: string;
  mode?: 'duration' | 'time';
  minutes?: number;
  hours?: number;
  days?: number;
  /** "HH:MM" in IST, for mode 'time'. */
  atTime?: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday?: number;
}

export interface MediaNodeData {
  label: string;
  kind?: 'image' | 'video' | 'document' | 'audio' | 'location';
  url?: string;
  caption?: string;
  filename?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  address?: string;
}

export type FlowActionOp =
  | { type: 'add_tags'; tags: string[] }
  | { type: 'remove_tags'; tags: string[] }
  | { type: 'set_temperature'; temperature: 'hot' | 'warm' | 'cold' }
  | { type: 'set_field'; field: string; value: string }
  | { type: 'assign'; memberId: string }
  | { type: 'create_task'; title: string; dueInHours?: number; assigneeId?: string }
  | { type: 'notify_team'; message: string; channel?: 'whatsapp' | 'email' }
  | { type: 'opt_out' };

export interface ActionNodeData {
  label: string;
  operations?: FlowActionOp[];
}

export interface TemplateNodeData {
  label: string;
  /** The template's name as Meta knows it. */
  templateName?: string;
  /** Its language code. A template exists once per language. */
  language?: string;
  /** Values for {{1}}, {{2}} … in the template body, in order. */
  bodyParams?: string[];
}

export interface AiReplyNodeData {
  label: string;
  /** Narrows the answer, e.g. "only about our pricing and plans". */
  instruction?: string;
  /** Sent when the model cannot be reached, so the customer is never ignored. */
  fallbackMessage?: string;
}

export type CollectKind = 'any' | 'name' | 'phone' | 'email' | 'number' | 'date' | 'time';

export interface CollectNodeData {
  label: string;
  message?: string;
  /** What the answer has to look like before it is accepted. */
  expects?: CollectKind;
  saveAsVariable?: string;
  /** Sent when the answer does not fit, before asking again. */
  retryMessage?: string;
  /** Re-asks before taking the "gave up" branch. Default 2. */
  maxAttempts?: number;
  timeoutHours?: number;
}

export type FlowNodeData =
  | StartNodeData
  | MessageNodeData
  | QuestionNodeData
  | ConditionNodeData
  | AssignAgentNodeData
  | EndNodeData
  | WaitNodeData
  | MediaNodeData
  | ActionNodeData
  | TemplateNodeData
  | AiReplyNodeData
  | CollectNodeData;

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

'use client';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageSquare, HelpCircle, GitBranch, UserCheck, CheckCircle, Clock, Image as ImageIcon, Zap, FileCheck, Sparkles, ClipboardCheck } from 'lucide-react';
import type { FlowNode, FlowNodeData } from '../../types';

interface AddNodeToolbarProps {
  onAddNode: (node: FlowNode) => void;
}

function randomOffset() {
  return Math.floor(Math.random() * 100);
}

const NODE_BUTTONS: Array<{
  type: string;
  label: string;
  icon: React.ReactNode;
  defaultData: FlowNodeData;
  color: string;
}> = [
  {
    type: 'message',
    label: 'Message',
    icon: <MessageSquare className="h-4 w-4" />,
    defaultData: { label: 'Message', message: '' },
    color: 'text-blue-600',
  },
  {
    type: 'question',
    label: 'Question',
    icon: <HelpCircle className="h-4 w-4" />,
    defaultData: { label: 'Question', message: '', timeoutHours: 24 },
    color: 'text-purple-600',
  },
  {
    type: 'wait',
    label: 'Wait',
    icon: <Clock className="h-4 w-4" />,
    defaultData: { label: 'Wait', mode: 'duration', hours: 2 },
    color: 'text-teal-600',
  },
  {
    type: 'media',
    label: 'Image / File',
    icon: <ImageIcon className="h-4 w-4" />,
    defaultData: { label: 'Send Image', kind: 'image', url: '' },
    color: 'text-cyan-600',
  },
  {
    type: 'collect',
    label: 'Ask & check',
    icon: <ClipboardCheck className="h-4 w-4" />,
    defaultData: { label: 'Ask & check', message: '', expects: 'phone', saveAsVariable: '', maxAttempts: 2, timeoutHours: 24 },
    color: 'text-sky-600',
  },
  {
    type: 'ai_reply',
    label: 'AI Reply',
    icon: <Sparkles className="h-4 w-4" />,
    defaultData: { label: 'AI Reply', instruction: '', fallbackMessage: 'Let me check that and get right back to you.' },
    color: 'text-fuchsia-600',
  },
  {
    type: 'template',
    label: 'Template (works after 24h)',
    icon: <FileCheck className="h-4 w-4" />,
    defaultData: { label: 'Template', templateName: '', language: 'en', bodyParams: [] },
    color: 'text-violet-600',
  },
  {
    type: 'action',
    label: 'Action',
    icon: <Zap className="h-4 w-4" />,
    defaultData: { label: 'Action', operations: [] },
    color: 'text-indigo-600',
  },
  {
    type: 'condition',
    label: 'Condition',
    icon: <GitBranch className="h-4 w-4" />,
    defaultData: { label: 'Condition', keyword: '', matchType: 'contains' },
    color: 'text-amber-600',
  },
  {
    type: 'assign_agent',
    label: 'Handoff',
    icon: <UserCheck className="h-4 w-4" />,
    defaultData: { label: 'Handoff to Agent', message: 'Connecting you to an agent...' },
    color: 'text-red-600',
  },
  {
    type: 'end',
    label: 'End',
    icon: <CheckCircle className="h-4 w-4" />,
    defaultData: { label: 'End', message: 'Thank you! Have a great day.' },
    color: 'text-gray-600',
  },
];

export function AddNodeToolbar({ onAddNode }: AddNodeToolbarProps) {
  const handleAdd = (type: string, defaultData: FlowNodeData) => {
    const newNode: FlowNode = {
      id: `${type}-${Date.now()}`,
      type: type as FlowNode['type'],
      position: { x: 200 + randomOffset(), y: 200 + randomOffset() },
      data: defaultData,
    };
    onAddNode(newNode);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2 p-2 bg-card border border-border rounded-lg shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
          Add Node
        </p>
        {NODE_BUTTONS.map((btn) => (
          <Tooltip key={btn.type}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-9 w-9 ${btn.color}`}
                onClick={() => handleAdd(btn.type, btn.defaultData)}
              >
                {btn.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{btn.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

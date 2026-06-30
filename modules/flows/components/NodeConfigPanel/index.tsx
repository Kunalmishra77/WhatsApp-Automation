'use client';
import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type {
  FlowNode, FlowNodeData,
  StartNodeData, MessageNodeData, QuestionNodeData,
  ConditionNodeData, AssignAgentNodeData, EndNodeData,
} from '../../types';

interface NodeConfigPanelProps {
  node: FlowNode | null;
  onSave: (nodeId: string, data: FlowNodeData) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeConfigPanel({ node, onSave, onDelete, onClose }: NodeConfigPanelProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) {
      setFormData({ ...node.data });
    }
  }, [node?.id]);

  if (!node) return null;

  const handleSave = () => {
    onSave(node.id, formData as unknown as FlowNodeData);
  };

  const set = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const renderFields = () => {
    switch (node.type) {
      case 'start': {
        const d = formData as Partial<StartNodeData>;
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Trigger Type</Label>
              <Select value={d.triggerType ?? 'keyword'} onValueChange={(v) => set('triggerType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Keyword</SelectItem>
                  <SelectItem value="first_message">First Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {d.triggerType === 'keyword' && (
              <div className="space-y-1.5">
                <Label>Trigger Keyword</Label>
                <Input
                  value={d.triggerValue ?? ''}
                  onChange={(e) => set('triggerValue', e.target.value)}
                  placeholder="e.g. hello, hi, start"
                />
              </div>
            )}
          </>
        );
      }
      case 'message': {
        const d = formData as Partial<MessageNodeData>;
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={d.message ?? ''}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Enter the message to send..."
                rows={4}
              />
            </div>
          </>
        );
      }
      case 'question': {
        const d = formData as Partial<QuestionNodeData>;
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Textarea
                value={d.message ?? ''}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Enter the question to ask..."
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timeout (hours)</Label>
              <Input
                type="number"
                min={1}
                max={72}
                value={d.timeoutHours ?? 24}
                onChange={(e) => set('timeoutHours', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Save reply as variable (optional)</Label>
              <Input
                value={d.saveAsVariable ?? ''}
                onChange={(e) => set('saveAsVariable', e.target.value)}
                placeholder="e.g. employee_count"
              />
            </div>
          </>
        );
      }
      case 'condition': {
        const d = formData as Partial<ConditionNodeData>;
        const conditionType = d.conditionType ?? 'keyword';
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Condition Type</Label>
              <Select value={conditionType} onValueChange={(v) => set('conditionType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Match keyword in reply</SelectItem>
                  <SelectItem value="variable_compare">Compare a saved number</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {conditionType === 'keyword' ? (
              <>
                <div className="space-y-1.5">
                  <Label>Match Type</Label>
                  <Select value={d.matchType ?? 'contains'} onValueChange={(v) => set('matchType', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="starts_with">Starts with</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Keyword</Label>
                  <Input
                    value={d.keyword ?? ''}
                    onChange={(e) => set('keyword', e.target.value)}
                    placeholder="e.g. yes, no, 1"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Variable Name</Label>
                  <Input
                    value={d.variable ?? ''}
                    onChange={(e) => set('variable', e.target.value)}
                    placeholder="e.g. employee_count"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Operator</Label>
                  <Select value={d.operator ?? '>='} onValueChange={(v) => set('operator', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">=">&gt;= (greater or equal)</SelectItem>
                      <SelectItem value=">">&gt; (greater than)</SelectItem>
                      <SelectItem value="<">&lt; (less than)</SelectItem>
                      <SelectItem value="<=">&lt;= (less or equal)</SelectItem>
                      <SelectItem value="==">== (equal)</SelectItem>
                      <SelectItem value="!=">!= (not equal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Value</Label>
                  <Input
                    type="number"
                    value={d.value ?? 0}
                    onChange={(e) => set('value', Number(e.target.value))}
                  />
                </div>
              </>
            )}
          </>
        );
      }
      case 'assign_agent': {
        const d = formData as Partial<AssignAgentNodeData>;
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Handoff Message</Label>
              <Textarea
                value={d.message ?? ''}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Message sent before handoff..."
                rows={3}
              />
            </div>
          </>
        );
      }
      case 'end': {
        const d = formData as Partial<EndNodeData>;
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Farewell Message</Label>
              <Textarea
                value={d.message ?? ''}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Final message to send..."
                rows={3}
              />
            </div>
          </>
        );
      }
      default:
        return <p className="text-sm text-muted-foreground">No configuration needed.</p>;
    }
  };

  const typeLabels: Record<string, string> = {
    start: 'Start',
    message: 'Message',
    question: 'Question',
    condition: 'Condition',
    assign_agent: 'Handoff to Agent',
    end: 'End',
  };

  return (
    <div className="w-72 h-full flex flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">
          Configure: {typeLabels[node.type ?? ''] ?? node.type}
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {renderFields()}
      </div>
      <div className="p-4 border-t border-border space-y-2">
        <Button className="w-full" onClick={handleSave}>Save Changes</Button>
        {node.type !== 'start' && (
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={() => { onDelete(node.id); onClose(); }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Delete Node
          </Button>
        )}
      </div>
    </div>
  );
}

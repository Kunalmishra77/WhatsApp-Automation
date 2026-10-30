'use client';
import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTemplates } from '@/modules/templates/hooks/useTemplates';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type {
  FlowNode, FlowNodeData,
  StartNodeData, MessageNodeData, QuestionNodeData,
  ConditionNodeData, AssignAgentNodeData, EndNodeData,
  WaitNodeData, MediaNodeData, ActionNodeData, TemplateNodeData, AiReplyNodeData, CollectNodeData, WebhookNodeData, FlowChoice, FlowActionOp,
} from '../../types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ACTION_LABELS: Record<FlowActionOp['type'], string> = {
  add_tags:        'Add a tag',
  remove_tags:     'Remove a tag',
  set_temperature: 'Mark hot / warm / cold',
  set_field:       'Save something on the contact',
  assign:          'Assign to a team member',
  create_task:     'Create a task',
  notify_team:     'Notify the team',
  opt_out:         'Stop messaging this contact',
};

// An option's id is what its branch edge is keyed on, so it is generated once
// and never derived from the title — renaming "Yes" must not orphan its branch.
function newChoiceId(): string {
  return `o${Math.random().toString(36).slice(2, 8)}`;
}

function defaultOp(type: FlowActionOp['type']): FlowActionOp {
  switch (type) {
    case 'add_tags':        return { type, tags: [] };
    case 'remove_tags':     return { type, tags: [] };
    case 'set_temperature': return { type, temperature: 'hot' };
    case 'set_field':       return { type, field: 'name', value: '' };
    case 'assign':          return { type, memberId: '' };
    case 'create_task':     return { type, title: '' };
    case 'notify_team':     return { type, message: '', channel: 'whatsapp' };
    case 'opt_out':         return { type };
  }
}

interface NodeConfigPanelProps {
  node: FlowNode | null;
  onSave: (nodeId: string, data: FlowNodeData) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeConfigPanel({ node, onSave, onDelete, onClose }: NodeConfigPanelProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  // Only approved templates can be sent, so the author picks from the real list
  // rather than typing a name that may not exist.
  const { data: templates = [] } = useTemplates();

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
        const opts: FlowChoice[] = d.choices ?? [];
        const answerMode = d.answerMode ?? (opts.length > 0 ? 'buttons' : 'text');
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
              <Label>How should they answer?</Label>
              <Select
                value={answerMode}
                onValueChange={(v) => set('answerMode', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">By typing</SelectItem>
                  <SelectItem value="buttons">Tapping a button (up to 3)</SelectItem>
                  <SelectItem value="list">Picking from a menu (up to 10)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {answerMode !== 'text' && (
              <div className="space-y-2 rounded-md border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Options</Label>
                  <span className="text-[10px] text-muted-foreground">
                    {opts.length}/{answerMode === 'buttons' ? 3 : 10}
                  </span>
                </div>
                {opts.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    <Input
                      className="h-8 text-sm"
                      value={c.title}
                      maxLength={answerMode === 'buttons' ? 20 : 24}
                      onChange={(e) => {
                        const next = [...opts];
                        next[i] = { ...c, title: e.target.value };
                        set('choices', next);
                      }}
                      placeholder={`Option ${i + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => set('choices', opts.filter((o) => o.id !== c.id))}
                      aria-label="Remove option"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {opts.length < (answerMode === 'buttons' ? 3 : 10) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() => set('choices', [...opts, { id: newChoiceId(), title: '' }])}
                  >
                    Add an option
                  </Button>
                )}
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Each option gets its own line out of this node on the canvas, so
                  you can send every answer somewhere different.
                </p>
              </div>
            )}

            {answerMode === 'list' && (
              <div className="space-y-1.5">
                <Label>Menu button text</Label>
                <Input
                  value={d.listButtonText ?? ''}
                  maxLength={20}
                  onChange={(e) => set('listButtonText', e.target.value)}
                  placeholder="Choose"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>If they don't reply, wait (hours)</Label>
              <Input
                type="number"
                min={0}
                max={72}
                value={d.timeoutHours ?? 24}
                onChange={(e) => set('timeoutHours', Number(e.target.value))}
              />
              <p className="text-[10px] leading-snug text-muted-foreground">
                After this, the flow takes the "No reply" line out of this node.
                Leave it unconnected to simply let the flow end.
              </p>
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
      case 'wait': {
        const d = formData as Partial<WaitNodeData>;
        const mode = d.mode ?? 'duration';
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Wait for</Label>
              <Select value={mode} onValueChange={(v) => set('mode', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="duration">A length of time</SelectItem>
                  <SelectItem value="time">A time of day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === 'duration' ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Days</Label>
                  <Input type="number" min={0} value={d.days ?? 0}
                    onChange={(e) => set('days', Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hours</Label>
                  <Input type="number" min={0} value={d.hours ?? 0}
                    onChange={(e) => set('hours', Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Minutes</Label>
                  <Input type="number" min={0} value={d.minutes ?? 0}
                    onChange={(e) => set('minutes', Number(e.target.value))} />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>At (IST)</Label>
                  <Input type="time" value={d.atTime ?? '10:00'}
                    onChange={(e) => set('atTime', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>On</Label>
                  <Select
                    value={typeof d.weekday === 'number' ? String(d.weekday) : 'any'}
                    onValueChange={(v) => set('weekday', v === 'any' ? undefined : Number(v))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">The next day it comes round</SelectItem>
                      {WEEKDAYS.map((w, i) => (
                        <SelectItem key={w} value={String(i)}>{w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <p className="text-[10px] leading-snug text-muted-foreground">
              The bot keeps answering normally while the flow waits, so a
              follow-up two days out does not mean two days of silence.
            </p>
          </>
        );
      }
      case 'media': {
        const d = formData as Partial<MediaNodeData>;
        const kind = d.kind ?? 'image';
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Send</Label>
              <Select value={kind} onValueChange={(v) => set('kind', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">An image</SelectItem>
                  <SelectItem value="document">A file (PDF and the like)</SelectItem>
                  <SelectItem value="video">A video</SelectItem>
                  <SelectItem value="audio">An audio clip</SelectItem>
                  <SelectItem value="location">A location pin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === 'location' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Latitude</Label>
                    <Input value={d.latitude ?? ''} inputMode="decimal"
                      onChange={(e) => set('latitude', e.target.value === '' ? undefined : Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Longitude</Label>
                    <Input value={d.longitude ?? ''} inputMode="decimal"
                      onChange={(e) => set('longitude', e.target.value === '' ? undefined : Number(e.target.value))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Place name</Label>
                  <Input value={d.locationName ?? ''}
                    onChange={(e) => set('locationName', e.target.value)}
                    placeholder="e.g. Fitness First, Kankarbagh" />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={d.address ?? ''}
                    onChange={(e) => set('address', e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>File link</Label>
                  <Input value={d.url ?? ''} onChange={(e) => set('url', e.target.value)}
                    placeholder="https://..." />
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    A public link WhatsApp can fetch. Upload it in Media Library
                    and paste the link here.
                  </p>
                </div>
                {kind === 'document' && (
                  <div className="space-y-1.5">
                    <Label>File name shown to the customer</Label>
                    <Input value={d.filename ?? ''}
                      onChange={(e) => set('filename', e.target.value)}
                      placeholder="e.g. Membership-Plans.pdf" />
                  </div>
                )}
                {kind !== 'audio' && (
                  <div className="space-y-1.5">
                    <Label>Caption (optional)</Label>
                    <Textarea rows={2} value={d.caption ?? ''}
                      onChange={(e) => set('caption', e.target.value)} />
                  </div>
                )}
              </>
            )}
          </>
        );
      }
      case 'action': {
        const d = formData as Partial<ActionNodeData>;
        const ops: FlowActionOp[] = d.operations ?? [];
        const replace = (i: number, op: FlowActionOp) => {
          const next = [...ops];
          next[i] = op;
          set('operations', next);
        };
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>

            {ops.map((op, i) => (
              <div key={i} className="space-y-2 rounded-md border border-border p-2.5">
                <div className="flex items-center gap-1.5">
                  <Select
                    value={op.type}
                    onValueChange={(v) => replace(i, defaultOp(v as FlowActionOp['type']))}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ACTION_LABELS) as Array<FlowActionOp['type']>).map((t) => (
                        <SelectItem key={t} value={t}>{ACTION_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => set('operations', ops.filter((_, j) => j !== i))}
                    aria-label="Remove action"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {(op.type === 'add_tags' || op.type === 'remove_tags') && (
                  <Input
                    className="h-8 text-sm"
                    value={(op.tags ?? []).join(', ')}
                    onChange={(e) => replace(i, {
                      ...op,
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })}
                    placeholder="comma separated, e.g. interested, diwali-offer"
                  />
                )}
                {op.type === 'set_temperature' && (
                  <Select value={op.temperature}
                    onValueChange={(v) => replace(i, { ...op, temperature: v as 'hot' | 'warm' | 'cold' })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {op.type === 'set_field' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={op.field}
                      onValueChange={(v) => replace(i, { ...op, field: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="city">City</SelectItem>
                        <SelectItem value="notes">Notes</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="h-8 text-sm" value={op.value ?? ''}
                      onChange={(e) => replace(i, { ...op, value: e.target.value })}
                      placeholder="{{name}}" />
                  </div>
                )}
                {op.type === 'assign' && (
                  <Input className="h-8 text-sm" value={op.memberId ?? ''}
                    onChange={(e) => replace(i, { ...op, memberId: e.target.value })}
                    placeholder="Team member's user id" />
                )}
                {op.type === 'create_task' && (
                  <div className="grid grid-cols-3 gap-2">
                    <Input className="col-span-2 h-8 text-sm" value={op.title ?? ''}
                      onChange={(e) => replace(i, { ...op, title: e.target.value })}
                      placeholder="Call {{name}} back" />
                    <Input className="h-8 text-sm" type="number" min={0}
                      value={op.dueInHours ?? ''}
                      onChange={(e) => replace(i, {
                        ...op,
                        dueInHours: e.target.value === '' ? undefined : Number(e.target.value),
                      })}
                      placeholder="in hrs" />
                  </div>
                )}
                {op.type === 'notify_team' && (
                  <Textarea rows={2} value={op.message ?? ''}
                    onChange={(e) => replace(i, { ...op, message: e.target.value })}
                    placeholder="New hot lead: {{name}}, {{system.phone}}" />
                )}
                {op.type === 'opt_out' && (
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    The contact stops receiving anything from this workspace.
                  </p>
                )}
              </div>
            ))}

            <Button
              variant="outline" size="sm" className="h-8 w-full text-xs"
              onClick={() => set('operations', [...ops, defaultOp('add_tags')])}
            >
              Add an action
            </Button>
          </>
        );
      }
      case 'template': {
        const d = formData as Partial<TemplateNodeData>;
        const approved = templates.filter((t) => t.status === 'approved');
        const chosen = approved.find((t) => t.name === d.templateName);
        // Meta numbers a template's blanks {{1}}, {{2}} … so the count comes
        // from the body itself rather than from anything stored here.
        const blanks = chosen
          ? [...new Set([...(chosen.body ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))]
              .sort((a, b) => a - b)
          : [];
        const params = d.bodyParams ?? [];
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select
                value={d.templateName ?? ''}
                onValueChange={(v) => {
                  const t = approved.find((x) => x.name === v);
                  set('templateName', v);
                  if (t?.language) set('language', t.language);
                  // Blanks belong to the chosen template, so anything mapped
                  // for the previous one would be meaningless here.
                  set('bodyParams', []);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={approved.length ? 'Choose an approved template' : 'No approved templates yet'} />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Only approved templates can be sent. A template is the only
                message WhatsApp allows more than 24 hours after the customer
                last wrote, which is what makes a long wait worth having.
              </p>
            </div>

            {chosen && (
              <div className="space-y-1.5">
                <Label className="text-xs">What it says</Label>
                <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs leading-snug">
                  {chosen.body}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Written and approved in WhatsApp — it cannot be edited here.
                </p>
              </div>
            )}

            {blanks.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Fill its blanks</Label>
                {blanks.map((num, i) => (
                  <div key={num} className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">{`{{${num}}}`}</span>
                    <Input
                      className="h-8 text-sm"
                      value={params[i] ?? ''}
                      onChange={(e) => {
                        const next = [...params];
                        while (next.length < blanks.length) next.push('');
                        next[i] = e.target.value;
                        set('bodyParams', next.slice(0, blanks.length));
                      }}
                      placeholder="{{name}} or fixed text"
                    />
                  </div>
                ))}
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Use an answer the flow saved, like {'{{name}}'}, or type something fixed.
                </p>
              </div>
            )}
          </>
        );
      }
      case 'ai_reply': {
        const d = formData as Partial<AiReplyNodeData>;
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>What should it answer? (optional)</Label>
              <Textarea
                rows={3}
                value={d.instruction ?? ''}
                onChange={(e) => set('instruction', e.target.value)}
                placeholder="e.g. only about our pricing and plans, in one short paragraph"
              />
              <p className="text-[10px] leading-snug text-muted-foreground">
                Leave this empty and the bot simply answers whatever the customer
                asked, using the same persona and knowledge base it uses
                everywhere else. Fill it in to keep the answer on one subject.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>If the AI cannot be reached</Label>
              <Textarea
                rows={2}
                value={d.fallbackMessage ?? ''}
                onChange={(e) => set('fallbackMessage', e.target.value)}
                placeholder="Let me check that and get right back to you."
              />
              <p className="text-[10px] leading-snug text-muted-foreground">
                A provider outage once sent every client the same generic line.
                Say something of your own here so a customer is never left
                waiting in silence.
              </p>
            </div>
          </>
        );
      }
      case 'collect': {
        const d = formData as Partial<CollectNodeData>;
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Textarea rows={3} value={d.message ?? ''} onChange={(e) => set('message', e.target.value)}
                placeholder="What is your mobile number?" />
            </div>
            <div className="space-y-1.5">
              <Label>What should the answer be?</Label>
              <Select value={d.expects ?? 'any'} onValueChange={(v) => set('expects', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">A mobile number</SelectItem>
                  <SelectItem value="email">An email address</SelectItem>
                  <SelectItem value="name">A name</SelectItem>
                  <SelectItem value="date">A date</SelectItem>
                  <SelectItem value="time">A time</SelectItem>
                  <SelectItem value="number">A number</SelectItem>
                  <SelectItem value="any">Anything</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] leading-snug text-muted-foreground">
                An answer that does not fit is not saved. A plain Question would
                have kept "asdf" as the phone number and nobody would have known.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Save the answer as</Label>
              <Input value={d.saveAsVariable ?? ''} onChange={(e) => set('saveAsVariable', e.target.value)}
                placeholder="e.g. phone" />
            </div>
            <div className="space-y-1.5">
              <Label>If the answer does not fit, say</Label>
              <Textarea rows={2} value={d.retryMessage ?? ''} onChange={(e) => set('retryMessage', e.target.value)}
                placeholder="Leave empty to use a sensible default" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Tries before giving up</Label>
                <Input type="number" min={1} max={5} value={d.maxAttempts ?? 2}
                  onChange={(e) => set('maxAttempts', Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">No reply after (hours)</Label>
                <Input type="number" min={0} max={72} value={d.timeoutHours ?? 24}
                  onChange={(e) => set('timeoutHours', Number(e.target.value))} />
              </div>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Connect the "gives up" line to a person. Asking a fourth time is
              worse than handing the conversation over.
            </p>
          </>
        );
      }
      case 'webhook': {
        const d = formData as Partial<WebhookNodeData>;
        const body = d.body ?? [];
        const saveFrom = d.saveFrom ?? [];
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={d.url ?? ''} onChange={(e) => set('url', e.target.value)}
                placeholder="https://your-system.com/leads" />
              <p className="text-[10px] leading-snug text-muted-foreground">
                Must be a public https address. Private and internal addresses
                are refused, because the call is made from our servers.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>How to send</Label>
              <Select value={d.method ?? 'POST'} onValueChange={(v) => set('method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST (as JSON)</SelectItem>
                  <SelectItem value="GET">GET (as query parameters)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-md border border-border p-2.5">
              <Label className="text-xs">What to send</Label>
              {body.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input className="h-8 w-28 text-sm" value={f.key}
                    onChange={(e) => { const next = [...body]; next[i] = { ...f, key: e.target.value }; set('body', next); }}
                    placeholder="field" />
                  <Input className="h-8 flex-1 text-sm" value={f.value}
                    onChange={(e) => { const next = [...body]; next[i] = { ...f, value: e.target.value }; set('body', next); }}
                    placeholder="{{name}}" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => set('body', body.filter((_, j) => j !== i))} aria-label="Remove field">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-8 w-full text-xs"
                onClick={() => set('body', [...body, { key: '', value: '' }])}>
                Add a field
              </Button>
            </div>

            <div className="space-y-2 rounded-md border border-border p-2.5">
              <Label className="text-xs">What to read back (optional)</Label>
              {saveFrom.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input className="h-8 flex-1 text-sm" value={f.responseKey}
                    onChange={(e) => { const next = [...saveFrom]; next[i] = { ...f, responseKey: e.target.value }; set('saveFrom', next); }}
                    placeholder="data.slot" />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input className="h-8 w-24 text-sm" value={f.saveAs}
                    onChange={(e) => { const next = [...saveFrom]; next[i] = { ...f, saveAs: e.target.value }; set('saveFrom', next); }}
                    placeholder="slot" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => set('saveFrom', saveFrom.filter((_, j) => j !== i))} aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-8 w-full text-xs"
                onClick={() => set('saveFrom', [...saveFrom, { responseKey: '', saveAs: '' }])}>
                Read a value back
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Give up after (seconds)</Label>
              <Input type="number" min={1} max={30} value={d.timeoutSeconds ?? 10}
                onChange={(e) => set('timeoutSeconds', Number(e.target.value))} />
              <p className="text-[10px] leading-snug text-muted-foreground">
                Connect the "if it fails" line somewhere. Another company's
                server being down should not leave your customer waiting.
              </p>
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
    template: 'Template',
    ai_reply: 'AI Reply',
    collect: 'Ask & check',
    webhook: 'Send to a system',
    wait: 'Wait',
    media: 'Image / File',
    action: 'Action',
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

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';
import {
  useCreateInboxRule,
  useUpdateInboxRule,
  type InboxRule,
  type RuleAction,
  type CreateInboxRulePayload,
} from '../../hooks/useInboxRules';

interface Props {
  open: boolean;
  onClose: () => void;
  rule?: InboxRule;
}

const TRIGGER_LABELS: Record<string, string> = {
  keyword:       'Keyword Match',
  first_message: 'First Message',
  any_message:   'Any Message',
};

const ACTION_LABELS: Record<string, string> = {
  label:        'Add Label',
  assign:       'Assign Agent',
  status:       'Change Status',
  auto_reply:   'Auto Reply',
  tag_contact:  'Tag Contact',
};

const STATUS_OPTIONS = ['open', 'pending', 'resolved', 'assigned'];

export function InboxRuleForm({ open, onClose, rule }: Props) {
  const members = useWorkspaceStore((s) => s.members);

  const [name, setName]                 = useState('');
  const [triggerType, setTriggerType]   = useState<string>('keyword');
  const [keywords, setKeywords]         = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [matchType, setMatchType]       = useState<'any' | 'all'>('any');
  const [actions, setActions]           = useState<RuleAction[]>([]);
  const [priority, setPriority]         = useState(0);

  const create = useCreateInboxRule();
  const update = useUpdateInboxRule();

  // Populate form when editing
  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setTriggerType(rule.trigger_type);
      setKeywords(rule.trigger_value.keywords ?? []);
      setMatchType(rule.trigger_value.match ?? 'any');
      setActions(rule.actions);
      setPriority(rule.priority);
    } else {
      setName('');
      setTriggerType('keyword');
      setKeywords([]);
      setKeywordInput('');
      setMatchType('any');
      setActions([]);
      setPriority(0);
    }
  }, [rule, open]);

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) return;
    setKeywords((prev) => [...prev, kw]);
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const addAction = () => {
    setActions((prev) => [...prev, { type: 'label', value: '' }]);
  };

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, field: keyof RuleAction, value: string) => {
    setActions((prev) =>
      prev.map((a, i) =>
        i === index ? { ...a, [field]: value } : a,
      ),
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (actions.length === 0) {
      toast.error('At least one action is required');
      return;
    }
    if (actions.some((a) => !a.value.trim())) {
      toast.error('All actions must have a value');
      return;
    }

    const payload: CreateInboxRulePayload = {
      name:          name.trim(),
      is_active:     rule?.is_active ?? true,
      trigger_type:  triggerType as InboxRule['trigger_type'],
      trigger_value: triggerType === 'keyword'
        ? { keywords, match: matchType }
        : {},
      actions,
      priority,
    };

    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, payload });
        toast.success('Rule updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Rule created');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit Rule' : 'New Inbox Rule'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              placeholder="e.g. Tag urgent keywords"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Trigger Type */}
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Keyword config */}
          {triggerType === 'keyword' && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-1.5">
                <Label>Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Type keyword and press Enter"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addKeyword(); }
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addKeyword}>
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1">
                      {kw}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full hover:text-destructive"
                        onClick={() => removeKeyword(kw)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Match Type</Label>
                <Select value={matchType} onValueChange={(v) => setMatchType(v as 'any' | 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any keyword (OR)</SelectItem>
                    <SelectItem value="all">All keywords (AND)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Actions</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addAction}>
                <Plus className="h-3 w-3" /> Add Action
              </Button>
            </div>

            {actions.length === 0 && (
              <p className="text-xs text-muted-foreground">No actions yet. Click &quot;Add Action&quot;.</p>
            )}

            {actions.map((action, index) => (
              <div key={index} className="flex items-start gap-2 rounded-md border border-border p-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Select
                    value={action.type}
                    onValueChange={(v) => updateAction(index, 'type', v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {action.type === 'status' ? (
                    <Select
                      value={action.value}
                      onValueChange={(v) => updateAction(index, 'value', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select status…" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : action.type === 'assign' ? (
                    <Select
                      value={action.value}
                      onValueChange={(v) => updateAction(index, 'value', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select agent…" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : action.type === 'auto_reply' ? (
                    <Textarea
                      className="text-sm"
                      placeholder="Reply message…"
                      rows={2}
                      value={action.value}
                      onChange={(e) => updateAction(index, 'value', e.target.value)}
                    />
                  ) : (
                    <Input
                      className="h-8 text-sm"
                      placeholder={action.type === 'label' ? 'Label name…' : 'Tag name…'}
                      value={action.value}
                      onChange={(e) => updateAction(index, 'value', e.target.value)}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAction(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-priority">Priority</Label>
            <Input
              id="rule-priority"
              type="number"
              min={0}
              max={100}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">Higher number = runs first. Default: 0.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isPending}>
            {isPending ? 'Saving…' : rule ? 'Save Changes' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

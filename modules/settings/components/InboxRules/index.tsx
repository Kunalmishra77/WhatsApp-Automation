'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useInboxRules,
  useUpdateInboxRule,
  useDeleteInboxRule,
  type InboxRule,
} from '../../hooks/useInboxRules';
import { InboxRuleForm } from '../InboxRuleForm';

const TRIGGER_LABELS: Record<string, string> = {
  keyword:       'Keyword Match',
  first_message: 'First Message',
  any_message:   'Any Message',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  label:       'Label',
  assign:      'Assign',
  status:      'Status',
  auto_reply:  'Auto Reply',
  tag_contact: 'Tag Contact',
};

function summariseActions(actions: InboxRule['actions']): string {
  if (actions.length === 0) return '—';
  return actions
    .map((a) => `${ACTION_TYPE_LABELS[a.type] ?? a.type}: ${a.value}`)
    .join(', ');
}

export function InboxRules() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<InboxRule | undefined>();

  const { data: rules = [], isLoading } = useInboxRules();
  const update = useUpdateInboxRule();
  const remove = useDeleteInboxRule();

  const handleToggle = async (rule: InboxRule, checked: boolean) => {
    try {
      await update.mutateAsync({ id: rule.id, payload: { is_active: checked } });
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async (rule: InboxRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await remove.mutateAsync(rule.id);
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleEdit = (rule: InboxRule) => {
    setEditing(rule);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Inbox Rules</h2>
          <p className="text-xs text-muted-foreground">Automate actions when messages arrive.</p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" /> New Rule
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Actions</TableHead>
              <TableHead className="w-20 text-center">Priority</TableHead>
              <TableHead className="w-20 text-center">Active</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : rules.map((rule) => (
                  <TableRow key={rule.id} className="hover:bg-accent">
                    <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {summariseActions(rule.actions)}
                    </TableCell>
                    <TableCell className="text-center text-sm">{rule.priority}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => void handleToggle(rule, checked)}
                        disabled={update.isPending}
                        aria-label={`Toggle rule ${rule.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => void handleDelete(rule)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!isLoading && rules.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No rules yet. Click &quot;New Rule&quot; to create your first automation.
            </p>
          </div>
        )}
      </div>

      <InboxRuleForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        rule={editing}
      />
    </div>
  );
}

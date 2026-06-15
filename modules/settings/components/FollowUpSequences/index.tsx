'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  useSequences,
  useCreateSequence,
  useUpdateSequence,
  useDeleteSequence,
  type FollowUpSequence,
  type SequenceStep,
} from '../../hooks/useSequences';

// ─── Step Builder ────────────────────────────────────────────────────────────

interface StepsBuilderProps {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
}

function StepsBuilder({ steps, onChange }: StepsBuilderProps) {
  const addStep = () =>
    onChange([...steps, { delay_hours: 24, message: '' }]);

  const removeStep = (index: number) =>
    onChange(steps.filter((_, i) => i !== index));

  const updateStep = (index: number, patch: Partial<SequenceStep>) =>
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Steps</p>
        <Button type="button" variant="outline" size="sm" onClick={addStep} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add Step
        </Button>
      </div>

      {steps.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">No steps yet. Add at least one step.</p>
      )}

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">Step {i + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeStep(i)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Send after</Label>
              <Input
                type="number"
                min={0}
                value={step.delay_hours}
                onChange={(e) => updateStep(i, { delay_hours: Number(e.target.value) })}
                className="h-7 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
            <Textarea
              value={step.message}
              onChange={(e) => updateStep(i, { message: e.target.value })}
              placeholder="Message text…"
              className="min-h-[60px] text-sm resize-none"
              rows={2}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sequence Form Dialog ────────────────────────────────────────────────────

interface SequenceFormProps {
  open: boolean;
  onClose: () => void;
  editing?: FollowUpSequence;
}

function SequenceForm({ open, onClose, editing }: SequenceFormProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [steps, setSteps] = useState<SequenceStep[]>(editing?.steps ?? []);
  const [saving, setSaving] = useState(false);

  const create = useCreateSequence();
  const update = useUpdateSequence();

  // Reset state when dialog opens for a new/different sequence
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(editing?.name ?? '');
      setSteps(editing?.steps ?? []);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (steps.length === 0) { toast.error('At least one step is required'); return; }
    if (steps.some((s) => !s.message.trim())) { toast.error('All steps need a message'); return; }

    setSaving(true);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, payload: { name: name.trim(), steps } });
        toast.success('Sequence updated');
      } else {
        await create.mutateAsync({ name: name.trim(), steps });
        toast.success('Sequence created');
      }
      onClose();
    } catch {
      toast.error('Failed to save sequence');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Sequence' : 'New Follow-Up Sequence'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="seq-name">Sequence Name</Label>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Post-purchase follow-up"
            />
          </div>

          <Separator />
          <StepsBuilder steps={steps} onChange={setSteps} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Sequence'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function FollowUpSequences() {
  const [formOpen,       setFormOpen]       = useState(false);
  const [editing,        setEditing]        = useState<FollowUpSequence | undefined>();
  const [pendingDelete,  setPendingDelete]  = useState<FollowUpSequence | null>(null);

  const { data: sequences = [], isLoading } = useSequences();
  const update = useUpdateSequence();
  const remove = useDeleteSequence();

  const handleToggle = async (seq: FollowUpSequence, checked: boolean) => {
    try {
      await update.mutateAsync({ id: seq.id, payload: { is_active: checked } });
    } catch {
      toast.error('Failed to update sequence');
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success('Sequence deleted');
      setPendingDelete(null);
    } catch {
      toast.error('Failed to delete sequence');
    }
  };

  const openEdit = (seq: FollowUpSequence) => {
    setEditing(seq);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(undefined);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Follow-Up Sequences</h2>
          <p className="text-sm text-muted-foreground">Automate multi-step follow-up messages to contacts.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> New Sequence
        </Button>
      </div>

      <Separator />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No sequences yet. Create one to automate follow-ups.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sequences.map((seq) => (
              <TableRow key={seq.id}>
                <TableCell className="font-medium text-sm">{seq.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={seq.is_active}
                      onCheckedChange={(checked) => void handleToggle(seq, checked)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {seq.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(seq)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(seq)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SequenceForm open={formOpen} onClose={closeForm} editing={editing} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete sequence?"
        description={`"${pendingDelete?.name}" and all its steps will be permanently deleted.`}
        confirmLabel="Delete Sequence"
        loading={remove.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

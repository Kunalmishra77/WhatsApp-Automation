'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateLead, useUpdateLead } from '../../hooks/useLeads';
import { LEAD_STAGES, STAGE_LABELS } from '../../services/lead.service';
import type { LeadRow } from '../../services/lead.service';
import { toast } from 'sonner';

const schema = z.object({
  title:       z.string().min(1, 'Title is required').max(255),
  stage:       z.enum(['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost']),
  value:       z.coerce.number().nonnegative().optional(),
  priority:    z.enum(['low', 'medium', 'high']),
  temperature: z.enum(['hot', 'warm', 'cold']),
  source:      z.string().max(100).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  lead?: LeadRow;
  defaultStage?: string;
}

export function LeadForm({ open, onClose, lead, defaultStage }: LeadFormProps) {
  const isEdit = !!lead;
  const create = useCreateLead();
  const update = useUpdateLead();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        title:       lead?.title ?? '',
        stage:       (lead?.stage ?? defaultStage ?? 'new') as FormValues['stage'],
        value:       lead?.value ?? undefined,
        priority:    (lead?.priority ?? 'medium') as FormValues['priority'],
        temperature: ((lead as any)?.temperature ?? 'warm') as FormValues['temperature'],
        source:      lead?.source ?? '',
      },
    });

  const stageValue       = watch('stage');
  const priorityValue    = watch('priority');
  const temperatureValue = watch('temperature');

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && lead) {
        await update.mutateAsync({ id: lead.id, payload: values });
        toast.success('Lead updated');
      } else {
        await create.mutateAsync({ ...values, tags: [] });
        toast.success('Lead created');
      }
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save lead');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Lead' : 'New Lead'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Lead Title</Label>
            <Input id="title" {...register('title')} placeholder="Enterprise deal — Acme Inc." />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stageValue} onValueChange={(v) => setValue('stage', v as FormValues['stage'])}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priorityValue} onValueChange={(v) => setValue('priority', v as FormValues['priority'])}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Lead Temperature</Label>
            <Select value={temperatureValue} onValueChange={(v) => setValue('temperature', v as FormValues['temperature'])}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hot">🔴 Hot — very interested, ready to buy</SelectItem>
                <SelectItem value="warm">🟡 Warm — engaged, needs nurturing</SelectItem>
                <SelectItem value="cold">🔵 Cold — not yet engaged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="value">Deal Value ($)</Label>
              <Input id="value" type="number" min="0" {...register('value')} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Input id="source" {...register('source')} placeholder="Website, referral…" />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

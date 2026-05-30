'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { WhatsAppPreview } from '../WhatsAppPreview';
import { useCreateTemplate, useUpdateTemplate } from '../../hooks/useTemplates';
import { extractVariables } from '../../services/template.service';
import type { TemplateRow } from '../../services/template.service';
import { toast } from 'sonner';

const schema = z.object({
  name:           z.string().min(1).max(255).regex(/^[a-z0-9_]+$/, 'Use only lowercase, numbers, underscores'),
  category:       z.enum(['authentication', 'marketing', 'utility']),
  language:       z.string().min(1),
  header_content: z.string().max(60).optional().or(z.literal('')),
  body:           z.string().min(1, 'Body is required').max(1024),
  footer:         z.string().max(60).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

interface TemplateFormProps {
  open: boolean;
  onClose: () => void;
  template?: TemplateRow;
}

export function TemplateForm({ open, onClose, template }: TemplateFormProps) {
  const isEdit = !!template;
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        name:           template?.name ?? '',
        category:       template?.category ?? 'marketing',
        language:       template?.language ?? 'en',
        header_content: template?.header_content ?? '',
        body:           template?.body ?? '',
        footer:         template?.footer ?? '',
      },
    });

  const [bodyValue, headerValue, footerValue, categoryValue] = watch(['body', 'header_content', 'footer', 'category']);

  useEffect(() => {
    if (open) {
      reset({
        name:           template?.name ?? '',
        category:       template?.category ?? 'marketing',
        language:       template?.language ?? 'en',
        header_content: template?.header_content ?? '',
        body:           template?.body ?? '',
        footer:         template?.footer ?? '',
      });
    }
  }, [open, template, reset]);

  const onSubmit = async (values: FormValues) => {
    const vars = extractVariables(values.body);
    try {
      if (isEdit && template) {
        await update.mutateAsync({ id: template.id, payload: { ...values, variables: vars } });
        toast.success('Template saved');
      } else {
        await create.mutateAsync({ ...values, variables: vars, status: 'pending', buttons: [] });
        toast.success('Template created — pending Meta approval');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6">
          <form id="template-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tname">Template Name</Label>
              <Input id="tname" {...register('name')} placeholder="welcome_message" />
              <p className="text-[11px] text-muted-foreground">Lowercase, numbers, underscores only</p>
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryValue} onValueChange={(v) => setValue('category', v as FormValues['category'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="utility">Utility</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select defaultValue="en" onValueChange={(v) => setValue('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="header_content">Header <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="header_content" {...register('header_content')} placeholder="Header text" maxLength={60} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                {...register('body')}
                placeholder="Hello {{1}}, your order {{2}} is ready!"
                className="min-h-28 resize-none"
                maxLength={1024}
              />
              {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
              <p className="text-right text-[11px] text-muted-foreground">{(bodyValue ?? '').length}/1024</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="footer">Footer <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="footer" {...register('footer')} placeholder="Reply STOP to unsubscribe" maxLength={60} />
            </div>
          </form>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>
            <WhatsAppPreview
              header={headerValue || undefined}
              body={bodyValue || ''}
              footer={footerValue || undefined}
            />
            {extractVariables(bodyValue ?? '').length > 0 && (
              <p className="text-xs text-muted-foreground">
                Variables: {extractVariables(bodyValue ?? '').join(', ')}
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="template-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

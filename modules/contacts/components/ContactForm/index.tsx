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
import { useCreateContact, useUpdateContact } from '../../hooks/useContacts';
import type { ContactRow } from '../../services/contact.service';
import { toast } from 'sonner';

const schema = z.object({
  name:    z.string().min(1, 'Name is required').max(255),
  phone:   z.string().min(7, 'Phone number is required').regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone'),
  email:   z.string().email('Invalid email').optional().or(z.literal('')),
  company: z.string().max(255).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  contact?: ContactRow;
}

export function ContactForm({ open, onClose, contact }: ContactFormProps) {
  const isEdit = !!contact;
  const create = useCreateContact();
  const update = useUpdateContact();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:    contact?.name ?? '',
      phone:   contact?.phone ?? '',
      email:   contact?.email ?? '',
      company: contact?.company ?? '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && contact) {
        await update.mutateAsync({ id: contact.id, payload: values });
        toast.success('Contact updated');
      } else {
        await create.mutateAsync({ ...values, tags: [] });
        toast.success('Contact created');
      }
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save contact');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Contact' : 'New Contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" {...register('name')} placeholder="Jane Smith" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (WhatsApp)</Label>
            <Input id="phone" {...register('phone')} placeholder="+1 555 000 0000" />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="email" type="email" {...register('email')} placeholder="jane@example.com" />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Company <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="company" {...register('company')} placeholder="Acme Inc." />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

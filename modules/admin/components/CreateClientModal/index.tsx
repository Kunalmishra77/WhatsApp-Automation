'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface FormState {
  business_name: string;
  owner_email: string;
  owner_phone: string;
  plan: string;
  industry: string;
}

const INITIAL_FORM: FormState = {
  business_name: '',
  owner_email: '',
  owner_phone: '',
  plan: 'starter',
  industry: '',
};

export function CreateClientModal({ open, onOpenChange, onSuccess }: CreateClientModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.business_name.trim()) {
      newErrors.business_name = 'Business name is required';
    }
    if (!form.owner_email.trim()) {
      newErrors.owner_email = 'Owner email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email)) {
      newErrors.owner_email = 'Enter a valid email address';
    }
    if (!form.plan) {
      newErrors.plan = 'Plan is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: form.business_name.trim(),
          owner_email: form.owner_email.trim(),
          owner_phone: form.owner_phone.trim() || undefined,
          plan: form.plan,
          industry: form.industry.trim() || undefined,
        }),
      });

      const data = await res.json() as { success?: boolean; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to create client');
      }

      toast.success('Client created! Invite email sent.');
      setForm(INITIAL_FORM);
      setErrors({});
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create client';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (loading) return;
    if (!val) {
      setForm(INITIAL_FORM);
      setErrors({});
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Create a new client workspace and send them an invite email.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Business Name */}
          <div className="space-y-1.5">
            <Label htmlFor="business_name">
              Business Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="business_name"
              placeholder="e.g. Sharma Medical Centre"
              value={form.business_name}
              onChange={(e) => setField('business_name', e.target.value)}
              disabled={loading}
              className={errors.business_name ? 'border-destructive' : ''}
            />
            {errors.business_name && (
              <p className="text-xs text-destructive">{errors.business_name}</p>
            )}
          </div>

          {/* Owner Email */}
          <div className="space-y-1.5">
            <Label htmlFor="owner_email">
              Owner Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="owner_email"
              type="email"
              placeholder="owner@business.com"
              value={form.owner_email}
              onChange={(e) => setField('owner_email', e.target.value)}
              disabled={loading}
              className={errors.owner_email ? 'border-destructive' : ''}
            />
            {errors.owner_email && (
              <p className="text-xs text-destructive">{errors.owner_email}</p>
            )}
          </div>

          {/* Owner Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="owner_phone">
              Owner Phone <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="owner_phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={form.owner_phone}
              onChange={(e) => setField('owner_phone', e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Plan */}
          <div className="space-y-1.5">
            <Label htmlFor="plan">
              Plan <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.plan}
              onValueChange={(val) => setField('plan', val)}
              disabled={loading}
            >
              <SelectTrigger id="plan" className={errors.plan ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="starter">Starter — ₹1,499/mo</SelectItem>
                <SelectItem value="pro">Pro — ₹2,999/mo</SelectItem>
                <SelectItem value="enterprise">Enterprise — ₹9,999/mo</SelectItem>
              </SelectContent>
            </Select>
            {errors.plan && (
              <p className="text-xs text-destructive">{errors.plan}</p>
            )}
          </div>

          {/* Industry */}
          <div className="space-y-1.5">
            <Label htmlFor="industry">
              Industry <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="industry"
              placeholder="e.g. Healthcare, Retail, Education"
              value={form.industry}
              onChange={(e) => setField('industry', e.target.value)}
              disabled={loading}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Creating...' : 'Create Client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

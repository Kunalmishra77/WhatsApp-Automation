'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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

const INITIAL: FormState = {
  business_name: '',
  owner_email:   '',
  owner_phone:   '',
  plan:          'starter',
  industry:      '',
};

export function CreateClientModal({ open, onOpenChange, onSuccess }: CreateClientModalProps) {
  const [form, setForm]     = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.business_name.trim()) e.business_name = 'Business name is required';
    if (!form.owner_email.trim()) {
      e.owner_email = 'Owner email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email)) {
      e.owner_email = 'Enter a valid email address';
    }
    if (!form.plan) e.plan = 'Plan is required';
    setErrors(e);
    return Object.keys(e).length === 0;
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
          owner_email:   form.owner_email.trim(),
          owner_phone:   form.owner_phone.trim() || undefined,
          plan:          form.plan,
          industry:      form.industry.trim() || undefined,
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create client');

      toast.success(`✅ ${form.business_name} created! Login credentials sent to ${form.owner_email}`);
      setForm(INITIAL);
      setErrors({});
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (loading) return;
    if (!val) { setForm(INITIAL); setErrors({}); }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Creates a workspace and sends login credentials to the client's email. The client will complete WhatsApp setup after first login.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="business_name">Business Name <span className="text-destructive">*</span></Label>
            <Input id="business_name" placeholder="e.g. Pagar Book" value={form.business_name}
              onChange={(e) => set('business_name', e.target.value)} disabled={loading}
              className={errors.business_name ? 'border-destructive' : ''} />
            {errors.business_name && <p className="text-xs text-destructive">{errors.business_name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="owner_email">Owner Email <span className="text-destructive">*</span></Label>
            <Input id="owner_email" type="email" placeholder="owner@business.com" value={form.owner_email}
              onChange={(e) => set('owner_email', e.target.value)} disabled={loading}
              className={errors.owner_email ? 'border-destructive' : ''} />
            {errors.owner_email && <p className="text-xs text-destructive">{errors.owner_email}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="owner_phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="owner_phone" type="tel" placeholder="+91 98765 43210" value={form.owner_phone}
                onChange={(e) => set('owner_phone', e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label>Plan <span className="text-destructive">*</span></Label>
              <Select value={form.plan} onValueChange={(v) => set('plan', v)} disabled={loading}>
                <SelectTrigger className={errors.plan ? 'border-destructive' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter — ₹1,499/mo</SelectItem>
                  <SelectItem value="pro">Pro — ₹2,999/mo</SelectItem>
                  <SelectItem value="enterprise">Enterprise — ₹9,999/mo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input id="industry" placeholder="e.g. HR, Healthcare, Retail" value={form.industry}
              onChange={(e) => set('industry', e.target.value)} disabled={loading} />
          </div>

          {/* Info box */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700 flex items-start gap-2">
            <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Login ID + password will be emailed to the client. They'll set up WhatsApp credentials
              on first login. You approve their account from this panel.
            </span>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Creating...' : 'Create & Send Invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

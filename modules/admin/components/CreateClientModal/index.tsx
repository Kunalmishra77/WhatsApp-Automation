'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, Copy, CheckCircle2, ExternalLink, Eye, EyeOff } from 'lucide-react';
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
  custom_password: string;
}

interface CreatedCredentials {
  email: string;
  password: string;
  business_name: string;
}

const INITIAL: FormState = {
  business_name:   '',
  owner_email:     '',
  owner_phone:     '',
  plan:            'starter',
  industry:        '',
  custom_password: '',
};

export function CreateClientModal({ open, onOpenChange, onSuccess }: CreateClientModalProps) {
  const [form, setForm]         = useState<FormState>(INITIAL);
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState<Partial<Record<keyof FormState, string>>>({});
  const [created, setCreated]   = useState<CreatedCredentials | null>(null);
  const [copied, setCopied]     = useState(false);
  const [showPass, setShowPass] = useState(false);

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
    if (form.custom_password && form.custom_password.length < 8) {
      e.custom_password = 'Password must be at least 8 characters';
    }
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
          business_name:   form.business_name.trim(),
          owner_email:     form.owner_email.trim(),
          owner_phone:     form.owner_phone.trim() || undefined,
          plan:            form.plan,
          industry:        form.industry.trim() || undefined,
          custom_password: form.custom_password.trim() || undefined,
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string; password?: string; owner_email?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create client');

      // Show credentials to admin (in case email didn't arrive)
      setCreated({
        email:         data.owner_email ?? form.owner_email,
        password:      data.password ?? '',
        business_name: form.business_name.trim(),
      });
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!created) return;
    const appUrl = window.location.origin;
    const text = `Agentix Login Credentials — ${created.business_name}\n\nURL: ${appUrl}/login\nEmail: ${created.email}\nPassword: ${created.password}\n\nPlease log in and complete your WhatsApp setup.`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success('Credentials copied! Share with client via WhatsApp/email.');
  };

  const handleClose = () => {
    if (loading) return;
    setForm(INITIAL);
    setErrors({});
    setCreated(null);
    setCopied(false);
    setShowPass(false);
    onOpenChange(false);
  };

  // ── Credentials screen (after creation) ─────────────────────────────────
  if (created) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Client Created!
            </DialogTitle>
            <DialogDescription>
              Share these credentials with <strong>{created.business_name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Login URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-white border rounded px-2 py-1.5 font-mono">
                    {window.location.origin}/login
                  </code>
                  <a href="/login" target="_blank">
                    <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email (Username)</Label>
                <code className="block text-sm bg-white border rounded px-2 py-1.5 font-mono">
                  {created.email}
                </code>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Password</Label>
                <code className="block text-sm bg-white border rounded px-2 py-1.5 font-mono font-bold tracking-wide">
                  {created.password}
                </code>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <strong>Note:</strong> Email delivery may not always work. Copy these credentials and share with the client directly via WhatsApp or email.
            </div>

            <div className="flex gap-3">
              <Button className="flex-1 gap-2" onClick={handleCopy}>
                {copied
                  ? <><CheckCircle2 className="h-4 w-4 text-green-400" /> Copied!</>
                  : <><Copy className="h-4 w-4" /> Copy Credentials</>}
              </Button>
              <Button variant="outline" onClick={handleClose}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Create form ───────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Creates a workspace and generates login credentials. You'll be shown the password to share with the client.
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

          <div className="space-y-1.5">
            <Label htmlFor="custom_password">
              Custom Password <span className="text-muted-foreground text-xs">(optional — auto-generated if blank)</span>
            </Label>
            <div className="relative">
              <Input
                id="custom_password"
                type={showPass ? 'text' : 'password'}
                placeholder="Leave blank to auto-generate"
                value={form.custom_password}
                onChange={(e) => set('custom_password', e.target.value)}
                disabled={loading}
                className={errors.custom_password ? 'border-destructive pr-9' : 'pr-9'}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPass((v) => !v)}
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.custom_password && <p className="text-xs text-destructive">{errors.custom_password}</p>}
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700 flex items-start gap-2">
            <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              After creating, you'll see the login credentials to copy and share with the client directly.
            </span>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
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

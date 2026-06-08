'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, MessageSquare, Users, BarChart3, Zap, Bot, Globe, Shield,
  Clock, Megaphone, Plus, Trash2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  workspaceName: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

interface FormData {
  businessName: string;
  industry: string;
  businessPhone: string;
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  appSecret: string;
  testPhone: string;
  connectionTested: boolean;
  selectedPlan: string;
}

interface ContactEntry {
  name: string;
  phone: string;
}

const INDUSTRIES = [
  'E-commerce', 'Healthcare', 'Education', 'Real Estate',
  'Retail', 'Restaurant', 'HR & Payroll', 'Finance', 'Logistics', 'Other',
] as const;

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: '₹1,499',
    period: '/month',
    tagline: 'For small businesses just starting out',
    highlight: false,
    features: [
      { icon: Bot,           text: '3 AI Agents' },
      { icon: MessageSquare, text: '1,000 messages/month' },
      { icon: Megaphone,     text: '5 broadcast campaigns/month' },
      { icon: Users,         text: 'Up to 5 team members' },
      { icon: Zap,           text: 'Chatbot flow builder' },
      { icon: BarChart3,     text: 'Basic analytics' },
    ],
    notIncluded: ['Custom AI models', 'API access', 'White-label'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '₹2,999',
    period: '/month',
    tagline: 'Best for growing teams',
    highlight: true,
    features: [
      { icon: Bot,           text: '10 AI Agents' },
      { icon: MessageSquare, text: '25,000 messages/month' },
      { icon: Megaphone,     text: '50 broadcast campaigns/month' },
      { icon: Users,         text: 'Unlimited team members' },
      { icon: Zap,           text: 'Advanced automation + flows' },
      { icon: BarChart3,     text: 'Full analytics + CSAT' },
      { icon: Globe,         text: 'Knowledge Base (500 docs)' },
      { icon: Clock,         text: 'Follow-up sequences' },
    ],
    notIncluded: ['White-label'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: '₹9,999',
    period: '/month',
    tagline: 'Unlimited scale',
    highlight: false,
    features: [
      { icon: Bot,           text: 'Unlimited AI Agents' },
      { icon: MessageSquare, text: 'Unlimited messages' },
      { icon: Megaphone,     text: 'Unlimited campaigns' },
      { icon: Users,         text: 'Unlimited team members' },
      { icon: Globe,         text: 'Unlimited Knowledge Base' },
      { icon: Shield,        text: 'API access + Webhooks' },
      { icon: Globe,         text: 'Custom domain (White-label)' },
      { icon: BarChart3,     text: 'Priority support + SLA' },
    ],
    notIncluded: [],
  },
] as const;

const TOTAL_STEPS = 5;

// ─── StepHeader ───────────────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle }: { step: Step; title: string; subtitle: string }) {
  const pct = ((step - 1) / (TOTAL_STEPS - 1)) * 100;
  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">A</div>
          <span className="text-label font-semibold uppercase tracking-widest text-brand-600">Agentix</span>
        </div>
        <span className="text-sm text-muted-foreground">Step {step} of {TOTAL_STEPS}</span>
      </div>
      <Progress value={pct} className="mb-6 h-1.5" />
      <div className="mb-6 flex items-center gap-2">
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <div key={s} className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all',
            s < step  ? 'bg-brand-500 text-white'
            : s === step ? 'border-2 border-brand-500 bg-brand-50 text-brand-600'
            : 'border border-border bg-muted text-muted-foreground',
          )}>
            {s < step ? '✓' : s}
          </div>
        ))}
      </div>
      <h1 className="text-heading-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-1.5 text-body-md text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ workspaceId, workspaceName }: Props) {
  const router = useRouter();

  const [step, setStep]       = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connStatus, setConnStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  const [form, setForm] = useState<FormData>({
    businessName:    workspaceName,
    industry:        '',
    businessPhone:   '',
    phoneNumberId:   '',
    accessToken:     '',
    wabaId:          '',
    appSecret:       '',
    testPhone:       '',
    connectionTested: false,
    selectedPlan:    '',
  });

  const [contacts, setContacts] = useState<ContactEntry[]>([
    { name: '', phone: '' },
  ]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Step 1: Business Info ──────────────────────────────────────────────────

  function handleStep1Continue() {
    if (!form.businessName.trim()) { toast.error('Enter your business name'); return; }
    if (!form.industry)            { toast.error('Select your industry'); return; }
    setStep(2);
  }

  // ── Step 2: WhatsApp Setup ─────────────────────────────────────────────────

  async function handleTestConnection() {
    if (!form.phoneNumberId.trim() || !form.accessToken.trim()) {
      toast.error('Phone Number ID and Access Token are required');
      return;
    }
    setTesting(true);
    setConnStatus('idle');
    try {
      const res  = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          phone_number_id: form.phoneNumberId,
          access_token:    form.accessToken,
          test_phone:      form.testPhone || undefined,
        }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        setConnStatus('ok');
        set('connectionTested', true);
        toast.success('✅ WhatsApp connected! Credentials verified.');
      } else {
        setConnStatus('fail');
        toast.error(data.error ?? 'Connection failed — check your credentials');
      }
    } catch {
      setConnStatus('fail');
      toast.error('Network error — please try again');
    } finally {
      setTesting(false);
    }
  }

  function handleStep2Continue() {
    if (!form.connectionTested) {
      toast.error('Please test your WhatsApp connection before continuing');
      return;
    }
    setStep(3);
  }

  // ── Step 3: Import Contacts ────────────────────────────────────────────────

  function addContactRow() {
    setContacts((prev) => [...prev, { name: '', phone: '' }]);
  }

  function removeContactRow(idx: number) {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateContact(idx: number, field: keyof ContactEntry, value: string) {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  async function handleImportContacts() {
    const valid = contacts.filter((c) => c.phone.trim());
    if (valid.length === 0) {
      // Skip — no contacts entered
      setStep(4);
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, contacts: valid }),
      });
      const data = await res.json() as { total?: number; inserted?: number; failed?: number; error?: string };
      if (res.ok) {
        toast.success(`✅ ${data.inserted ?? valid.length} contact(s) imported!`);
        setStep(4);
      } else {
        toast.error(data.error ?? 'Failed to import contacts');
      }
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setImporting(false);
    }
  }

  // ── Step 4: Plan Selection ────────────────────────────────────────────────

  function handleSelectPlan(planKey: string) {
    set('selectedPlan', planKey);
    setStep(5);
  }

  // ── Step 5: Submit for Approval ───────────────────────────────────────────

  async function handleSubmit() {
    setLoading(true);
    try {
      const res  = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          phone_number_id: form.phoneNumberId,
          access_token:    form.accessToken,
          waba_id:         form.wabaId || undefined,
          app_secret:      form.appSecret || undefined,
          industry:        form.industry || undefined,
          business_phone:  form.businessPhone || undefined,
          selected_plan:   form.selectedPlan || 'starter',
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.success) {
        toast.success('Setup complete! Waiting for admin approval.');
        router.push('/pending-approval');
      } else {
        toast.error(data.error ?? 'Failed to complete setup. Try again.');
      }
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : '/api/webhooks/whatsapp';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4 py-12">
      <div className="w-full max-w-2xl animate-fade-in">

        {/* ── STEP 1: Business Info ── */}
        {step === 1 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader step={1} title="Tell us about your business"
              subtitle="Help us personalise your Agentix workspace." />
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business Name</Label>
                <Input id="businessName" value={form.businessName}
                  onChange={(e) => set('businessName', e.target.value)} placeholder="e.g. Pagar Book" />
              </div>
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Select value={form.industry} onValueChange={(v) => set('industry', v)}>
                  <SelectTrigger><SelectValue placeholder="Select your industry" /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="businessPhone">Business Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input id="businessPhone" value={form.businessPhone}
                  onChange={(e) => set('businessPhone', e.target.value)} placeholder="+91 98765 43210" />
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <Button onClick={handleStep1Continue} className="gap-2">Continue →</Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: WhatsApp Setup ── */}
        {step === 2 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader step={2} title="Connect your WhatsApp"
              subtitle="Enter your Meta WhatsApp Business API credentials." />

            <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <p className="font-semibold mb-1">Where to find these from Meta Developer Console</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li><strong>Phone Number ID</strong> — WhatsApp → Getting Started → Phone Number ID</li>
                <li><strong>Access Token</strong> — System Users → Generate Token (never expires)</li>
                <li><strong>WABA ID</strong> — WhatsApp Business Account ID (optional but recommended)</li>
                <li><strong>App Secret</strong> — App Dashboard → Settings → Basic → App Secret</li>
              </ul>
              <div className="mt-2 pt-2 border-t border-blue-200 text-xs">
                <strong>Your Webhook URL:</strong>{' '}
                <code className="bg-blue-100 px-1 rounded">{webhookUrl}</code><br />
                <strong>Verify Token:</strong>{' '}
                <code className="bg-blue-100 px-1 rounded">agentix-webhook-secret-2026</code>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phoneNumberId">Phone Number ID <span className="text-destructive">*</span></Label>
                  <Input id="phoneNumberId" value={form.phoneNumberId}
                    onChange={(e) => { set('phoneNumberId', e.target.value); setConnStatus('idle'); set('connectionTested', false); }}
                    placeholder="1173335072523347" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wabaId">WABA ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input id="wabaId" value={form.wabaId}
                    onChange={(e) => set('wabaId', e.target.value)} placeholder="1708964607185517" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accessToken">Permanent Access Token <span className="text-destructive">*</span></Label>
                <Input id="accessToken" type="password" value={form.accessToken}
                  onChange={(e) => { set('accessToken', e.target.value); setConnStatus('idle'); set('connectionTested', false); }}
                  placeholder="EAAxxxxx..." />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appSecret">App Secret <span className="text-muted-foreground text-xs">(for secure webhook)</span></Label>
                <Input id="appSecret" type="password" value={form.appSecret}
                  onChange={(e) => set('appSecret', e.target.value)} placeholder="c4176c068ebbae..." />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="testPhone">Your WhatsApp number to receive test message <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input id="testPhone" value={form.testPhone}
                  onChange={(e) => { set('testPhone', e.target.value); setConnStatus('idle'); set('connectionTested', false); }}
                  placeholder="+91 98765 43210" />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="gap-2">
                  {testing
                    ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Testing…</>
                    : 'Test Connection'}
                </Button>
                {connStatus === 'ok'  && (
                  <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                  </Badge>
                )}
                {connStatus === 'fail' && (
                  <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700">
                    ❌ Failed
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={handleStep2Continue} disabled={!form.connectionTested} className="gap-2">
                Continue →
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Import Contacts ── */}
        {step === 3 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader step={3} title="Import your first contacts"
              subtitle="Add a few contacts to get started — you can import more later." />

            <div className="space-y-3">
              {contacts.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder="Name (optional)"
                    value={c.name}
                    onChange={(e) => updateContact(idx, 'name', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="+91 98765 43210"
                    value={c.phone}
                    onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                    className="flex-1"
                  />
                  {contacts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeContactRow(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {contacts.length < 10 && (
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={addContactRow}>
                <Plus className="h-3.5 w-3.5" /> Add another
              </Button>
            )}

            <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <strong>Tip:</strong> You can also bulk-import contacts via CSV from the Contacts page after setup.
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setStep(4)} className="text-muted-foreground">
                  Skip for now
                </Button>
                <Button onClick={handleImportContacts} disabled={importing} className="gap-2">
                  {importing
                    ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Importing…</>
                    : contacts.some((c) => c.phone.trim()) ? 'Import & Continue →' : 'Continue →'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Plan Selection ── */}
        {step === 4 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader step={4} title="Choose your plan"
              subtitle="All plans include WhatsApp CRM, AI automation, and real-time inbox." />

            <div className="grid gap-4 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <div key={plan.key} className={cn(
                  'relative flex flex-col rounded-xl border p-5 transition-all cursor-pointer hover:shadow-md',
                  plan.highlight
                    ? 'border-brand-500 bg-brand-50 shadow-md shadow-brand-500/10'
                    : 'border-border bg-card hover:border-brand-300',
                )}>
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-brand-500 text-white shadow-sm">Most Popular</Badge>
                    </div>
                  )}

                  <div className="mb-3">
                    <h3 className="font-bold text-foreground text-base">{plan.name}</h3>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                      <span className="text-xs text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
                  </div>

                  <ul className="mb-4 flex-1 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-center gap-1.5 text-xs text-foreground">
                        <f.icon className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        {f.text}
                      </li>
                    ))}
                    {plan.notIncluded.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground/60 line-through">
                        <span className="h-3.5 w-3.5 shrink-0 text-center text-[10px]">✗</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="sm"
                    variant={plan.highlight ? 'default' : 'outline'}
                    className={cn('w-full', plan.highlight && 'bg-brand-500 hover:bg-brand-600')}
                    onClick={() => handleSelectPlan(plan.key)}
                  >
                    Choose {plan.name}
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>← Back</Button>
              <p className="text-xs text-muted-foreground">Plans are billed monthly. Cancel anytime.</p>
            </div>
          </div>
        )}

        {/* ── STEP 5: Summary + Submit ── */}
        {step === 5 && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <StepHeader step={5} title="Ready to submit!"
              subtitle="Review your setup and submit for admin approval." />

            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-semibold text-amber-900 mb-2">📋 What happens next</p>
              <ol className="text-xs text-amber-800 space-y-1 list-decimal list-inside">
                <li>Your setup details will be sent to the Agentix admin</li>
                <li>Admin reviews and activates your account (usually within a few hours)</li>
                <li>You'll see this page update automatically when approved</li>
                <li>Once active — your full WhatsApp CRM dashboard opens</li>
              </ol>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-sm mb-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setup Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div><span className="text-muted-foreground">Business:</span> <span className="font-medium">{form.businessName}</span></div>
                <div><span className="text-muted-foreground">Industry:</span> <span className="font-medium">{form.industry}</span></div>
                <div><span className="text-muted-foreground">WhatsApp:</span> <span className="font-medium text-green-600">✓ Connected</span></div>
                <div><span className="text-muted-foreground">Plan:</span> <span className="font-medium capitalize">{form.selectedPlan}</span></div>
                {form.phoneNumberId && (
                  <div className="col-span-2"><span className="text-muted-foreground">Phone ID:</span> <span className="font-mono text-xs">{form.phoneNumberId}</span></div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(4)}>← Back</Button>
              <Button onClick={handleSubmit} disabled={loading} className="gap-2 bg-green-600 hover:bg-green-700">
                {loading
                  ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Submitting…</>
                  : '🚀 Submit for Approval'}
              </Button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-caption text-muted-foreground">
          © {new Date().getFullYear()} Agentix — Enterprise WhatsApp CRM
        </p>
      </div>
    </div>
  );
}

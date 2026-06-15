'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Wifi, WifiOff, Users, MessageSquare, Building2,
  Globe, CheckCircle2, XCircle, Clock, AlertTriangle, Send, RefreshCw,
  ShieldCheck, BarChart3, Ticket,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getLimits } from '@/lib/plan-features';
import type { WorkspaceRow } from '@/app/api/admin/workspaces/route';

type Tab = 'overview' | 'whatsapp' | 'members' | 'tickets';

interface Member {
  id: string;
  role: string;
  is_online: boolean;
  created_at: string;
  profiles: { id: string; full_name: string | null; email: string | null; avatar_url: string | null } | null;
}

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  submitted_by: string | null;
  description: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
  workspaces?: { name: string; slug: string } | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  low:    'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high:   'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
};
const STATUS_COLOR: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-600',
};

function StatBox({ label, value, limit }: { label: string; value: number; limit?: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-center">
      <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value.toLocaleString('en-IN')}</div>
      {limit !== undefined && <div className="text-[11px] text-muted-foreground">/{limit.toLocaleString('en-IN')}</div>}
    </div>
  );
}

export function ClientDetail({ workspace: w, onClose, onRefetch }: {
  workspace: WorkspaceRow;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const [tab, setTab]               = useState<Tab>('overview');
  const [pendingAction, setPending] = useState<string | null>(null);
  const [localPhoneId, setLocalPhoneId] = useState<string>('');

  // WhatsApp form
  const [waPhone, setWaPhone] = useState('');
  const [waToken, setWaToken] = useState('');
  const [waWaba,  setWaWaba]  = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [persona,        setPersona]        = useState('');
  const [personaLoading, setPersonaLoading] = useState(false);

  // Members tab
  const [members,  setMembers]  = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Tickets tab
  const [tickets,  setTickets]  = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [ticketFilter, setTicketFilter] = useState<string>('all');

  const limits = getLimits(w.plan);

  const statusLabel = (() => {
    if (w.subscription_status === 'pending_approval') return { text: 'Pending Approval', cls: 'bg-orange-50 text-orange-600 border-orange-200' };
    if (!w.is_active) return { text: 'Blocked', cls: 'bg-red-50 text-red-600 border-red-200' };
    if (w.subscription_status === 'halted')   return { text: 'Halted',  cls: 'bg-orange-50 text-orange-600 border-orange-200' };
    if (w.subscription_status === 'trialing') return { text: 'Trial',   cls: 'bg-sky-50 text-sky-600 border-sky-200' };
    return { text: 'Active', cls: 'bg-green-50 text-green-600 border-green-200' };
  })();

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const patchWorkspace = async (body: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/admin/workspaces/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed');
    toast.success(successMsg);
    onRefetch();
  };

  // Fetch WA credentials + persona on mount so Overview tab status is correct too
  useEffect(() => {
    fetch(`/api/admin/workspaces/${w.id}/settings`)
      .then(r => r.ok ? r.json() as Promise<{ settings?: { agent_persona?: string }; phone_number_id?: string; waba_id?: string; has_token?: boolean }> : null)
      .then(d => {
        if (!d) return;
        if (d.phone_number_id) { setWaPhone(d.phone_number_id); setLocalPhoneId(d.phone_number_id); }
        if (d.waba_id)         setWaWaba(d.waba_id);
        if (d.has_token)       setHasToken(true);
        if (d.settings?.agent_persona) setPersona(d.settings.agent_persona);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.id]);

  // ── Tab loaders ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'whatsapp') {
      // already loaded on mount — no extra fetch needed
    }
    if (tab === 'members' && members.length === 0) {
      setMembersLoading(true);
      fetch(`/api/admin/workspaces/${w.id}/members`)
        .then(r => r.json() as Promise<{ members: Member[] }>)
        .then(d => setMembers(d.members ?? []))
        .catch(() => toast.error('Failed to load members'))
        .finally(() => setMembersLoading(false));
    }
    if (tab === 'tickets' && tickets.length === 0) {
      loadTickets();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadTickets = () => {
    setTicketsLoading(true);
    fetch(`/api/admin/support-tickets?workspaceId=${w.id}`)
      .then(r => r.json() as Promise<{ tickets: SupportTicket[] }>)
      .then(d => setTickets(d.tickets ?? []))
      .catch(() => toast.error('Failed to load tickets'))
      .finally(() => setTicketsLoading(false));
  };

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleSavePersona = async () => {
    setPersonaLoading(true);
    try {
      await patchWorkspace({ settings: { agent_persona: persona.trim() } }, 'AI persona saved');
    } catch { toast.error('Failed to save persona'); }
    finally { setPersonaLoading(false); }
  };

  const handleSaveWhatsApp = async () => {
    if (!waPhone.trim()) { toast.error('Phone Number ID required'); return; }
    if (!waToken.trim() && !hasToken) { toast.error('Access Token required'); return; }
    setPending('wa');
    try {
      const body: Record<string, unknown> = {
        phone_number_id: waPhone.trim(),
        waba_id: waWaba.trim() || null,
        onboarding_complete: true,
      };
      if (waToken.trim()) body.access_token = waToken.trim();
      await patchWorkspace(body, `WhatsApp credentials saved for ${w.name}`);
      setLocalPhoneId(waPhone.trim());
      setWaToken('');
      setHasToken(true);
      toast.success('WhatsApp connected ✓');
    } catch { toast.error('Failed to save credentials'); }
    finally { setPending(null); }
  };

  const handleBlock = async () => {
    setPending('block');
    try {
      const newActive = !w.is_active;
      await patchWorkspace({ is_active: newActive }, newActive ? `${w.name} unblocked` : `${w.name} blocked`);
      onClose();
    } catch { toast.error('Failed'); }
    finally { setPending(null); }
  };

  const handleApprove = async () => {
    setPending('approve');
    try { await patchWorkspace({ subscription_status: 'active' }, `${w.name} approved`); onClose(); }
    catch { toast.error('Failed'); }
    finally { setPending(null); }
  };

  const handleChangePlan = async (plan: string) => {
    if (plan === w.plan) return;
    setPending('plan');
    try { await patchWorkspace({ plan }, `${w.name} plan → ${plan}`); }
    catch { toast.error('Failed'); }
    finally { setPending(null); }
  };

  const handleSendDomain = async (domain: string) => {
    setPending('domain');
    try { await patchWorkspace({ custom_domain: domain || null }, 'Custom domain updated'); }
    catch { toast.error('Failed'); }
    finally { setPending(null); }
  };

  const handleTicketReply = async (ticketId: string, status: string) => {
    const reply = replyText[ticketId] ?? '';
    setPending(`ticket-${ticketId}`);
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_reply: reply }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Ticket updated');
      loadTickets();
      setReplyText(prev => ({ ...prev, [ticketId]: '' }));
    } catch { toast.error('Failed to update ticket'); }
    finally { setPending(null); }
  };

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview',  label: 'Overview',  icon: BarChart3    },
    { key: 'whatsapp',  label: 'WhatsApp',  icon: Wifi         },
    { key: 'members',   label: 'Members',   icon: Users        },
    { key: 'tickets',   label: 'Tickets',   icon: Ticket       },
  ];

  const filteredTickets = ticketFilter === 'all'
    ? tickets
    : tickets.filter(t => t.status === ticketFilter);

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl font-bold truncate">{w.name}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{w.slug}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Badge variant="outline" className="text-xs font-bold uppercase">{w.plan}</Badge>
              <Badge variant="outline" className={cn('text-xs', statusLabel.cls)}>{statusLabel.text}</Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Client since {formatDate(w.created_at)}</p>
        </SheetHeader>

        {/* Tab nav */}
        <div className="flex border-b border-border px-6 shrink-0 gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                tab === key
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {key === 'tickets' && tickets.filter(t => t.status === 'open').length > 0 && (
                <span className="ml-0.5 rounded-full bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                  {tickets.filter(t => t.status === 'open').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <>
              {/* Stats */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">This Month Usage</p>
                <div className="grid grid-cols-3 gap-2">
                  <StatBox label="Messages"      value={w.messages_this_month} limit={limits.maxMessages} />
                  <StatBox label="Contacts"      value={w.contacts_count}      limit={limits.maxContacts} />
                  <StatBox label="Team Members"  value={w.member_count} />
                </div>
              </div>

              {/* Details grid */}
              <div className="rounded-lg border bg-muted/20 divide-y divide-border text-sm">
                {[
                  ['Owner',           w.owner_email ?? '—'],
                  ['Total Contacts',  w.contacts_count.toLocaleString('en-IN')],
                  ['Conversations',   w.conversations_count.toLocaleString('en-IN')],
                  ['Sub. Status',     w.subscription_status ?? '—'],
                  ['Created',         formatDate(w.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center px-4 py-2.5 gap-3">
                    <span className="text-muted-foreground w-32 shrink-0">{k}</span>
                    <span className="font-medium truncate">{v}</span>
                  </div>
                ))}
                <div className="flex items-center px-4 py-2.5 gap-3">
                  <span className="text-muted-foreground w-32 shrink-0">WhatsApp</span>
                  {localPhoneId
                    ? <span className="text-green-600 font-medium flex items-center gap-1"><Wifi className="h-3.5 w-3.5" /> Connected ({localPhoneId})</span>
                    : <span className="text-red-500 font-medium flex items-center gap-1"><WifiOff className="h-3.5 w-3.5" /> Not configured</span>}
                </div>
              </div>

              {/* Custom domain */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Domain</p>
                <CustomDomainEditor
                  current={w.custom_domain ?? ''}
                  saving={pendingAction === 'domain'}
                  onSave={handleSendDomain}
                />
              </div>

              {/* Plan + actions */}
              <Separator />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-40">
                  {pendingAction === 'plan'
                    ? <div className="flex items-center justify-center h-9"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    : (
                      <Select value={w.plan} onValueChange={(v) => void handleChangePlan(v)} disabled={!!pendingAction}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['free','starter','pro','enterprise'].map(p => (
                            <SelectItem key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase()+p.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                </div>
                <Button
                  variant="outline" size="sm" className="h-9 text-xs"
                  onClick={() => void handleBlock()} disabled={!!pendingAction}
                >
                  {pendingAction === 'block' ? <Loader2 className="h-3 w-3 animate-spin" /> : w.is_active ? 'Block Client' : 'Unblock Client'}
                </Button>
                {w.subscription_status === 'pending_approval' && (
                  <Button
                    size="sm" className="h-9 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => void handleApprove()} disabled={!!pendingAction}
                  >
                    {pendingAction === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve</>}
                  </Button>
                )}
              </div>
            </>
          )}

          {/* ── WHATSAPP ── */}
          {tab === 'whatsapp' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold mb-0.5">WhatsApp Business Credentials</h3>
                <p className="text-xs text-muted-foreground">Set credentials on behalf of this client. They will receive all messages via these credentials.</p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  {localPhoneId
                    ? <><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-sm font-medium text-green-700">Connected: {localPhoneId}</span></>
                    : <><XCircle className="h-4 w-4 text-red-500" /><span className="text-sm font-medium text-red-600">Not configured</span></>}
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Phone Number ID *</Label>
                    <Input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="e.g. 1173335072523347" className="text-xs h-8 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Permanent Access Token *</Label>
                    <Input value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder={hasToken ? '••••••• (token saved — enter new to replace)' : 'EAAVyl...'} type="password" className="text-xs h-8 font-mono" />
                    {hasToken && !waToken && (
                      <p className="text-[11px] text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Token already saved. Leave blank to keep it.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">WhatsApp Business Account ID (WABA ID)</Label>
                    <Input value={waWaba} onChange={(e) => setWaWaba(e.target.value)} placeholder="e.g. 1708964607185517" className="text-xs h-8 font-mono" />
                  </div>
                </div>
                <div className="rounded-md bg-blue-100 px-3 py-2 text-xs text-blue-800">
                  <span className="font-semibold">Webhook URL to give client:</span>{' '}
                  <code className="bg-blue-200 px-1 rounded break-all select-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp'}
                  </code>
                </div>
                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => void handleSaveWhatsApp()} disabled={pendingAction === 'wa'}>
                  {pendingAction === 'wa' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ShieldCheck className="h-3.5 w-3.5" />Save & Activate</>}
                </Button>
              </div>

              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-0.5">Webhook Status</h3>
                <div className="rounded-lg border px-4 py-3 space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {localPhoneId
                      ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> WhatsApp webhook ready</>
                      : <><AlertTriangle className="h-4 w-4 text-amber-500" /> Credentials not set — webhook inactive</>}
                  </div>
                </div>
              </div>

              <Separator />
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold mb-0.5">AI Agent Persona</h3>
                  <p className="text-xs text-muted-foreground">
                    System prompt for this client's WhatsApp AI bot. Describe the business, tone, and how to handle common button clicks.
                  </p>
                </div>
                <Textarea
                  rows={8}
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  placeholder={`You are Riya, sales consultant for PagarBook — attendance & payroll automation for 1 lakh+ businesses.\nAlways reply in Hinglish. Be warm, concise (2-3 sentences max).\n\nBUTTON "Know more" → PagarBook se attendance aur salary automatically calculate hote hain. Koi manual work nahi. Aapki company mein kitne employees hain?\nBUTTON "Book Demo" → Bilkul! Hamare expert 20-30 minute mein sab dikhayenge — free mein. Is hafte kab acha rahega?\nBUTTON "Not Interested" → Koi baat nahi! Kabhi zarurat ho toh hum yahan hain. Aapka din shubh ho! 🙏`}
                  className="text-xs font-mono resize-y"
                />
                <Button
                  size="sm" className="h-8 text-xs gap-1.5"
                  onClick={() => void handleSavePersona()}
                  disabled={personaLoading}
                >
                  {personaLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save Persona'}
                </Button>
              </div>
            </div>
          )}

          {/* ── MEMBERS ── */}
          {tab === 'members' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Team Members ({members.length})
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                  setMembers([]);
                  setMembersLoading(true);
                  fetch(`/api/admin/workspaces/${w.id}/members`)
                    .then(r => r.json() as Promise<{ members: Member[] }>)
                    .then(d => setMembers(d.members ?? []))
                    .finally(() => setMembersLoading(false));
                }}>
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
              </div>
              {membersLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No members found</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {(m.profiles?.full_name ?? m.profiles?.email ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.profiles?.full_name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.profiles?.email ?? '—'}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                        <span className={cn('w-2 h-2 rounded-full', m.is_online ? 'bg-green-500' : 'bg-gray-300')} title={m.is_online ? 'Online' : 'Offline'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TICKETS ── */}
          {tab === 'tickets' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Support Tickets ({tickets.length})
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={ticketFilter}
                    onChange={e => setTicketFilter(e.target.value)}
                    className="text-xs border border-border rounded-md px-2 py-1 bg-background outline-none"
                  >
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={loadTickets}>
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
              </div>

              {ticketsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : filteredTickets.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Ticket className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No tickets {ticketFilter !== 'all' ? `with status "${ticketFilter}"` : 'from this client'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map((t) => (
                    <div key={t.id} className="rounded-lg border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{t.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t.submitted_by} · {formatDate(t.created_at)} · {t.category}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge className={cn('text-[10px] px-1.5', PRIORITY_COLOR[t.priority] ?? '')}>{t.priority}</Badge>
                          <Badge className={cn('text-[10px] px-1.5', STATUS_COLOR[t.status] ?? '')}>{t.status.replace('_', ' ')}</Badge>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2">{t.description}</p>

                      {t.admin_reply && (
                        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2">
                          <p className="text-[11px] font-semibold text-green-800 mb-0.5">Admin Reply</p>
                          <p className="text-xs text-green-700">{t.admin_reply}</p>
                        </div>
                      )}

                      {t.status !== 'resolved' && t.status !== 'closed' && (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            placeholder="Type your reply…"
                            className="text-xs min-h-16 resize-none"
                            value={replyText[t.id] ?? ''}
                            onChange={e => setReplyText(prev => ({ ...prev, [t.id]: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm" className="h-7 text-xs gap-1"
                              disabled={pendingAction === `ticket-${t.id}` || !(replyText[t.id] ?? '').trim()}
                              onClick={() => void handleTicketReply(t.id, 'in_progress')}
                            >
                              {pendingAction === `ticket-${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3" />Reply</>}
                            </Button>
                            <Button
                              variant="outline" size="sm" className="h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                              disabled={pendingAction === `ticket-${t.id}`}
                              onClick={() => void handleTicketReply(t.id, 'resolved')}
                            >
                              <CheckCircle2 className="h-3 w-3" /> Mark Resolved
                            </Button>
                            <Button
                              variant="ghost" size="sm" className="h-7 text-xs"
                              disabled={pendingAction === `ticket-${t.id}`}
                              onClick={() => void handleTicketReply(t.id, 'closed')}
                            >
                              Close
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CustomDomainEditor({ current, saving, onSave }: { current: string; saving: boolean; onSave: (v: string) => void }) {
  const [val, setVal] = useState(current);
  return (
    <div className="flex gap-2">
      <Input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="app.clientdomain.com"
        className="text-sm font-mono"
      />
      <Button size="sm" variant="outline" disabled={saving || val === current} onClick={() => onSave(val)} className="shrink-0 gap-1">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Globe className="h-3.5 w-3.5" />Save</>}
      </Button>
    </div>
  );
}

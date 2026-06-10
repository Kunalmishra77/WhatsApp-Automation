'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Ticket, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace.store';

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-600',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SupportModal({ open, onClose }: Props) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  const [view,     setView]     = useState<'new' | 'history'>('new');
  const [subject,  setSubject]  = useState('');
  const [desc,     setDesc]     = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);

  const [tickets,        setTickets]        = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [expanded,       setExpanded]       = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!subject.trim() || !desc.trim()) { toast.error('Subject and description required'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, subject, description: desc, category, priority }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed');
      }
      setSent(true);
      setSubject(''); setDesc(''); setCategory('general'); setPriority('medium');
      setTimeout(() => { setSent(false); setView('history'); loadTickets(); }, 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit ticket');
    } finally {
      setSending(false);
    }
  };

  const loadTickets = () => {
    if (!workspaceId) return;
    setTicketsLoading(true);
    fetch(`/api/support-tickets?workspaceId=${workspaceId}`)
      .then(r => r.json() as Promise<{ tickets: SupportTicket[] }>)
      .then(d => setTickets(d.tickets ?? []))
      .catch(() => toast.error('Failed to load tickets'))
      .finally(() => setTicketsLoading(false));
  };

  const handleTabChange = (tab: 'new' | 'history') => {
    setView(tab);
    if (tab === 'history' && tickets.length === 0) loadTickets();
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-brand-600" />
            Support Center
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border -mx-6 px-6 mb-1">
          {(['new', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
                view === t
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'new' ? 'New Ticket' : 'My Tickets'}
            </button>
          ))}
        </div>

        {/* New ticket form */}
        {view === 'new' && (
          <div className="space-y-3">
            {sent ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="font-semibold text-foreground">Ticket submitted!</p>
                <p className="text-sm text-muted-foreground">Our team will respond shortly.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full text-xs rounded-md border border-border bg-background px-3 py-2 outline-none"
                    >
                      <option value="general">General</option>
                      <option value="billing">Billing</option>
                      <option value="technical">Technical</option>
                      <option value="bug">Bug Report</option>
                      <option value="feature">Feature Request</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <select
                      value={priority}
                      onChange={e => setPriority(e.target.value)}
                      className="w-full text-xs rounded-md border border-border bg-background px-3 py-2 outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="subject" className="text-xs">Subject *</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief description of the issue"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="desc" className="text-xs">Description *</Label>
                  <Textarea
                    id="desc"
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Describe the issue in detail — what happened, what you expected, any error messages..."
                    className="min-h-28 resize-none text-sm"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={handleSubmit}
                    disabled={sending || !subject.trim() || !desc.trim()}
                    className="flex-1 gap-2"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Ticket'}
                  </Button>
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Ticket history */}
        {view === 'history' && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {ticketsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No tickets submitted yet.
              </div>
            ) : (
              tickets.map((t) => (
                <div key={t.id} className="rounded-lg border bg-card">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(t.created_at)} · {t.category}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <Badge className={cn('text-[10px] px-1.5', STATUS_COLOR[t.status] ?? '')}>
                        {t.status.replace('_', ' ')}
                      </Badge>
                      {expanded === t.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                  {expanded === t.id && t.admin_reply && (
                    <div className="px-4 pb-3">
                      <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2">
                        <p className="text-[11px] font-semibold text-green-800 mb-0.5">Reply from Support</p>
                        <p className="text-xs text-green-700">{t.admin_reply}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

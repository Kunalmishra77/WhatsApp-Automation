'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, MessageSquare, List, Zap, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonItem { id: string; title: string }
interface ListRow    { id: string; title: string; description: string }
interface ListSection { title: string; rows: ListRow[] }

interface InteractiveMessageBuilderProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}

function uid(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 8)}`; }

// ── Quick-start presets ────────────────────────────────────────────────────
const BUTTON_PRESETS = [
  { label: 'Yes / No', buttons: ['Yes', 'No'] },
  { label: 'Interested?', buttons: ['Interested ✅', 'Not Now', 'More Info'] },
  { label: 'Confirm Order', buttons: ['Confirm ✅', 'Cancel ❌'] },
  { label: 'Support', buttons: ['Talk to Agent', 'FAQ', 'Call Me'] },
];

export function InteractiveMessageBuilder({
  open, onClose, conversationId,
}: InteractiveMessageBuilderProps) {
  const [activeTab, setActiveTab]   = useState<'button' | 'list'>('button');
  const [isSending, setIsSending]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [sent, setSent]             = useState(false);

  // Button tab
  const [btnBody,   setBtnBody]   = useState('');
  const [btnHeader, setBtnHeader] = useState('');
  const [btnFooter, setBtnFooter] = useState('');
  const [buttons, setButtons]     = useState<ButtonItem[]>([{ id: uid('btn'), title: '' }]);

  // List tab
  const [listBody,       setListBody]       = useState('');
  const [listHeader,     setListHeader]     = useState('');
  const [listFooter,     setListFooter]     = useState('');
  const [listButtonText, setListButtonText] = useState('View Options');
  const [sections, setSections] = useState<ListSection[]>([
    { title: '', rows: [{ id: uid('row'), title: '', description: '' }] },
  ]);

  function reset() {
    setBtnBody(''); setBtnHeader(''); setBtnFooter('');
    setButtons([{ id: uid('btn'), title: '' }]);
    setListBody(''); setListHeader(''); setListFooter('');
    setListButtonText('View Options');
    setSections([{ title: '', rows: [{ id: uid('row'), title: '', description: '' }] }]);
    setError(null); setSent(false); setActiveTab('button');
  }

  function handleClose() { reset(); onClose(); }

  // Button helpers
  const addButton = () => { if (buttons.length < 3) setButtons(p => [...p, { id: uid('btn'), title: '' }]); };
  const removeButton = (i: number) => setButtons(p => p.filter((_, j) => j !== i));
  const updateButton = (i: number, t: string) => setButtons(p => p.map((b, j) => j === i ? { ...b, title: t } : b));
  const applyPreset = (btns: string[]) => {
    setBtnBody(p => p || 'How can we help you today?');
    setButtons(btns.map(t => ({ id: uid('btn'), title: t })));
  };

  // List helpers
  const addSection = () => setSections(p => [...p, { title: '', rows: [{ id: uid('row'), title: '', description: '' }] }]);
  const removeSection = (i: number) => setSections(p => p.filter((_, j) => j !== i));
  const updateSectionTitle = (i: number, t: string) => setSections(p => p.map((s, j) => j === i ? { ...s, title: t } : s));
  const addRow = (si: number) => setSections(p => p.map((s, i) => i === si ? { ...s, rows: [...s.rows, { id: uid('row'), title: '', description: '' }] } : s));
  const removeRow = (si: number, ri: number) => setSections(p => p.map((s, i) => i === si ? { ...s, rows: s.rows.filter((_, j) => j !== ri) } : s));
  const updateRow = (si: number, ri: number, f: 'title' | 'description', v: string) =>
    setSections(p => p.map((s, i) => i === si ? { ...s, rows: s.rows.map((r, j) => j === ri ? { ...r, [f]: v } : r) } : s));

  async function handleSend() {
    setError(null);
    const isButton = activeTab === 'button';
    if (isButton) {
      if (!btnBody.trim()) { setError('Body text is required'); return; }
      if (!buttons.length) { setError('Add at least one button'); return; }
      if (buttons.some(b => !b.title.trim())) { setError('All buttons need a title'); return; }
    } else {
      if (!listBody.trim()) { setError('Body text is required'); return; }
      if (!listButtonText.trim()) { setError('List button text is required'); return; }
      if (!sections.length) { setError('Add at least one section'); return; }
      if (sections.some(s => !s.rows.length || s.rows.some(r => !r.title.trim()))) { setError('All rows need a title'); return; }
    }
    setIsSending(true);
    try {
      const payload = isButton
        ? { conversationId, type: 'button' as const, body: btnBody.trim(), header: btnHeader.trim() || undefined, footer: btnFooter.trim() || undefined, buttons: buttons.map(b => ({ id: b.id, title: b.title.trim() })) }
        : { conversationId, type: 'list' as const, body: listBody.trim(), header: listHeader.trim() || undefined, footer: listFooter.trim() || undefined, listButtonText: listButtonText.trim(), sections: sections.map(s => ({ title: s.title, rows: s.rows.map(r => ({ id: r.id, title: r.title.trim(), description: r.description.trim() || undefined })) })) };
      const res = await fetch('/api/messages/interactive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Send failed'); return; }
      setSent(true);
      setTimeout(() => { reset(); onClose(); }, 800);
    } catch { setError('Network error — please try again'); }
    finally { setIsSending(false); }
  }

  const previewBody   = activeTab === 'button' ? btnBody   : listBody;
  const previewHeader = activeTab === 'button' ? btnHeader : listHeader;
  const previewFooter = activeTab === 'button' ? btnFooter : listFooter;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-brand-500" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">Interactive Message</DialogTitle>
            <p className="text-xs text-muted-foreground">Send buttons or a list — customer taps to reply</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-0">
          {/* ── Builder ──────────────────────────────────────────────── */}
          <div className="px-6 py-4 space-y-5 border-r border-border">
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'button' | 'list')}>
              <TabsList className="w-full h-9">
                <TabsTrigger value="button" className="flex-1 gap-1.5 text-xs">
                  <MessageSquare className="h-3.5 w-3.5" /> Quick Reply Buttons
                </TabsTrigger>
                <TabsTrigger value="list" className="flex-1 gap-1.5 text-xs">
                  <List className="h-3.5 w-3.5" /> List Message
                </TabsTrigger>
              </TabsList>

              {/* ── BUTTON TAB ── */}
              <TabsContent value="button" className="space-y-4 mt-4">
                {/* Quick start presets */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Zap className="h-3 w-3" /> Quick start
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {BUTTON_PRESETS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p.buttons)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors font-medium"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Message Body <span className="text-destructive">*</span></Label>
                    <span className="text-[10px] text-muted-foreground">{btnBody.length}/1024</span>
                  </div>
                  <Textarea placeholder="e.g. How can we help you today?" value={btnBody} onChange={e => setBtnBody(e.target.value)} rows={3} maxLength={1024} className="text-sm resize-none" />
                </div>

                {/* Header */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Header <span className="text-[10px]">(optional)</span></Label>
                    <span className="text-[10px] text-muted-foreground">{btnHeader.length}/60</span>
                  </div>
                  <Input placeholder="e.g. Welcome to Agentix" value={btnHeader} onChange={e => setBtnHeader(e.target.value)} maxLength={60} className="h-8 text-sm" />
                </div>

                {/* Footer */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Footer <span className="text-[10px]">(optional)</span></Label>
                  <Input placeholder="e.g. Reply anytime" value={btnFooter} onChange={e => setBtnFooter(e.target.value)} maxLength={60} className="h-8 text-sm" />
                </div>

                {/* Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Buttons <span className="text-[10px] text-muted-foreground">({buttons.length}/3 max)</span></Label>
                    <Button type="button" variant="outline" size="sm" onClick={addButton} disabled={buttons.length >= 3} className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                  {buttons.map((btn, i) => (
                    <div key={btn.id} className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Input placeholder={`Button ${i + 1}`} value={btn.title} onChange={e => updateButton(i, e.target.value)} maxLength={20} className="h-8 text-sm pr-10" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{btn.title.length}/20</span>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:text-destructive" onClick={() => removeButton(i)} disabled={buttons.length === 1}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* ── LIST TAB ── */}
              <TabsContent value="list" className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Message Body <span className="text-destructive">*</span></Label>
                    <span className="text-[10px] text-muted-foreground">{listBody.length}/1024</span>
                  </div>
                  <Textarea placeholder="e.g. Choose an option below" value={listBody} onChange={e => setListBody(e.target.value)} rows={3} maxLength={1024} className="text-sm resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Header (optional)</Label>
                    <Input placeholder="Header" value={listHeader} onChange={e => setListHeader(e.target.value)} maxLength={60} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Footer (optional)</Label>
                    <Input placeholder="Footer" value={listFooter} onChange={e => setListFooter(e.target.value)} maxLength={60} className="h-8 text-sm" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">List Button Label <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. View Options" value={listButtonText} onChange={e => setListButtonText(e.target.value)} maxLength={20} className="h-8 text-sm" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Sections</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addSection} className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" /> Add Section
                    </Button>
                  </div>
                  {sections.map((section, si) => (
                    <div key={si} className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input placeholder="Section title (optional)" value={section.title} onChange={e => updateSectionTitle(si, e.target.value)} className="flex-1 h-7 text-xs" />
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => removeSection(si)} disabled={sections.length === 1}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-2 pl-1">
                        {section.rows.map((row, ri) => (
                          <div key={row.id} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Input placeholder="Option title *" value={row.title} onChange={e => updateRow(si, ri, 'title', e.target.value)} className="flex-1 h-7 text-xs" maxLength={24} />
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => removeRow(si, ri)} disabled={section.rows.length === 1}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <Input placeholder="Description (optional)" value={row.description} onChange={e => updateRow(si, ri, 'description', e.target.value)} className="h-6 text-[11px]" maxLength={72} />
                          </div>
                        ))}
                        <button onClick={() => addRow(si)} className="flex items-center gap-1 text-[11px] text-brand-500 hover:text-brand-600 font-medium mt-1">
                          <Plus className="h-3 w-3" /> Add option
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Phone Preview ──────────────────────────────────────── */}
          <div className="px-4 py-4 space-y-2 bg-muted/20">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Preview</p>
            {/* Phone shell */}
            <div className="mx-auto w-[200px] rounded-[24px] border-[3px] border-gray-800 bg-gray-800 shadow-xl overflow-hidden">
              {/* Status bar */}
              <div className="bg-[#075E54] h-7 flex items-center px-3 gap-2">
                <div className="h-4 w-4 rounded-full bg-white/20" />
                <div className="flex-1 h-2 rounded bg-white/20" />
              </div>
              {/* Chat area */}
              <div className="bg-[#ECE5DD] min-h-[260px] p-2.5 flex items-start">
                <div className="max-w-full rounded-2xl rounded-bl-sm bg-white shadow-sm overflow-hidden text-[11px] w-full">
                  {previewHeader && (
                    <div className="px-2.5 pt-2 pb-1 font-semibold text-gray-900 border-b border-gray-100 leading-tight">
                      {previewHeader}
                    </div>
                  )}
                  <div className="px-2.5 py-1.5 text-gray-800 whitespace-pre-wrap break-words leading-snug min-h-[32px]">
                    {previewBody || <span className="text-gray-300 italic">Message body…</span>}
                  </div>
                  {previewFooter && (
                    <div className="px-2.5 pb-1.5 text-[9px] text-gray-400 leading-tight">{previewFooter}</div>
                  )}
                  <div className="px-2.5 pb-1 flex justify-end">
                    <span className="text-[9px] text-gray-400">12:30 ✓✓</span>
                  </div>

                  {activeTab === 'button' && buttons.some(b => b.title) && (
                    <div className="border-t border-gray-100">
                      {buttons.map((btn, i) => (
                        <div key={btn.id} className={cn('px-2.5 py-1.5 text-center text-[11px] font-medium text-[#00a5f4] flex items-center justify-center gap-1', i < buttons.length - 1 && 'border-b border-gray-100')}>
                          <ChevronRight className="h-2.5 w-2.5" />
                          {btn.title || <span className="text-gray-200">Button {i + 1}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'list' && (
                    <div className="border-t border-gray-100 px-2.5 py-1.5 flex items-center justify-center gap-1 text-[11px] font-medium text-[#00a5f4]">
                      <List className="h-2.5 w-2.5" />
                      {listButtonText || 'View Options'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Limits info */}
            <div className="space-y-1 text-[10px] text-muted-foreground px-1">
              {activeTab === 'button' ? (
                <>
                  <p>• Max 3 buttons, 20 chars each</p>
                  <p>• Customer taps to reply</p>
                </>
              ) : (
                <>
                  <p>• Up to 10 sections</p>
                  <p>• Max 20 options total</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/10">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : sent ? (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Sent!
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {activeTab === 'button'
                ? `${buttons.length} button${buttons.length !== 1 ? 's' : ''} configured`
                : `${sections.reduce((t, s) => t + s.rows.length, 0)} option${sections.reduce((t, s) => t + s.rows.length, 0) !== 1 ? 's' : ''} configured`}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={isSending}>Cancel</Button>
            <Button size="sm" onClick={() => void handleSend()} disabled={isSending || sent} className="bg-brand-500 hover:bg-brand-600 gap-1.5">
              {sent ? <><CheckCircle2 className="h-3.5 w-3.5" /> Sent!</> : isSending ? 'Sending…' : <><MessageSquare className="h-3.5 w-3.5" /> Send Message</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

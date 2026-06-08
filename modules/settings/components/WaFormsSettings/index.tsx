'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Trash2, Pencil, ChevronDown, ChevronUp, FileText,
  Eye, BarChart2, X, GripVertical, CheckSquare, Type, Hash, Mail, Phone, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Question {
  id: string;
  text: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'choice' | 'date';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface WaForm {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  questions: Question[];
  completion_message: string;
  total_responses: number;
  created_at: string;
}

interface FormResponse {
  id: string;
  contact_name?: string;
  contact_phone?: string;
  answers: Record<string, string>;
  submitted_at: string;
}

const Q_TYPES: { value: Question['type']; label: string; icon: React.ElementType }[] = [
  { value: 'text',   label: 'Short Text', icon: Type },
  { value: 'email',  label: 'Email',      icon: Mail },
  { value: 'phone',  label: 'Phone',      icon: Phone },
  { value: 'number', label: 'Number',     icon: Hash },
  { value: 'choice', label: 'Choice',     icon: CheckSquare },
  { value: 'date',   label: 'Date',       icon: Calendar },
];

function uid() { return `q_${Math.random().toString(36).slice(2, 8)}`; }

const DEFAULT_FORM: Partial<WaForm> = {
  name: '',
  description: '',
  questions: [{ id: uid(), text: '', type: 'text', required: true }],
  completion_message: 'Thank you for your response! We will be in touch soon. 🙏',
};

export function WaFormsSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();

  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState<WaForm | null>(null);
  const [formData,    setFormData]    = useState<Partial<WaForm>>(DEFAULT_FORM);
  const [saving,      setSaving]      = useState(false);
  const [viewingResp, setViewingResp] = useState<WaForm | null>(null);

  const { data } = useQuery({
    queryKey: ['wa-forms', workspaceId],
    queryFn: async () => {
      const r = await fetch(`/api/wa-forms?workspaceId=${workspaceId}`);
      return r.ok ? r.json() as Promise<{ forms: WaForm[] }> : { forms: [] };
    },
    enabled: !!workspaceId,
  });

  const { data: respData } = useQuery({
    queryKey: ['wa-form-responses', viewingResp?.id],
    queryFn: async () => {
      const r = await fetch(`/api/wa-forms/${viewingResp!.id}/responses`);
      return r.ok ? r.json() as Promise<{ form: WaForm; responses: FormResponse[] }> : null;
    },
    enabled: !!viewingResp,
  });

  const forms = data?.forms ?? [];
  const setQ = (k: keyof Partial<WaForm>, v: unknown) => setFormData(p => ({ ...p, [k]: v }));

  function openNew() {
    setEditing(null);
    setFormData({ ...DEFAULT_FORM, questions: [{ id: uid(), text: '', type: 'text', required: true }] });
    setShowForm(true);
  }

  function openEdit(f: WaForm) {
    setEditing(f);
    setFormData({ name: f.name, description: f.description, questions: f.questions, completion_message: f.completion_message });
    setShowForm(true);
  }

  // Question helpers
  const questions = (formData.questions ?? []) as Question[];
  const addQuestion = () => setQ('questions', [...questions, { id: uid(), text: '', type: 'text', required: true }]);
  const removeQuestion = (idx: number) => setQ('questions', questions.filter((_, i) => i !== idx));
  const updateQuestion = (idx: number, patch: Partial<Question>) =>
    setQ('questions', questions.map((q, i) => i === idx ? { ...q, ...patch } : q));
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const qs = [...questions];
    const target = idx + dir;
    if (target < 0 || target >= qs.length) return;
    const a = qs[idx]; const b = qs[target];
    if (a && b) { qs[idx] = b; qs[target] = a; }
    setQ('questions', qs);
  };

  async function handleSave() {
    if (!formData.name?.trim()) { toast.error('Form name required'); return; }
    if (!questions.length)      { toast.error('Add at least one question'); return; }
    if (questions.some(q => !q.text.trim())) { toast.error('All questions need text'); return; }
    setSaving(true);
    try {
      const body = { workspaceId, ...formData };
      const url    = editing ? `/api/wa-forms/${editing.id}` : '/api/wa-forms';
      const method = editing ? 'PATCH' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { toast.error('Save failed'); return; }
      toast.success(editing ? 'Form updated!' : 'Form created!');
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ['wa-forms', workspaceId] });
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this form and all its responses?')) return;
    await fetch(`/api/wa-forms/${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    void queryClient.invalidateQueries({ queryKey: ['wa-forms', workspaceId] });
  }

  async function handleToggle(f: WaForm) {
    await fetch(`/api/wa-forms/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !f.is_active }),
    });
    void queryClient.invalidateQueries({ queryKey: ['wa-forms', workspaceId] });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">WhatsApp Forms</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Collect leads, feedback, and bookings via multi-step WhatsApp conversations.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" className="gap-1.5 bg-brand-500 hover:bg-brand-600" onClick={openNew}>
            <Plus className="h-4 w-4" /> New Form
          </Button>
        )}
      </div>

      {/* Form builder */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Form Name <span className="text-destructive">*</span></Label>
                <Input value={formData.name ?? ''} onChange={e => setQ('name', e.target.value)} placeholder="e.g. Lead Capture Form" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description (optional)</Label>
                <Input value={formData.description ?? ''} onChange={e => setQ('description', e.target.value)} placeholder="What this form collects" className="h-8 text-sm" />
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Questions ({questions.length})</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addQuestion}>
                  <Plus className="h-3 w-3" /> Add Question
                </Button>
              </div>

              {questions.map((q, idx) => {
                const TypeIcon = Q_TYPES.find(t => t.value === q.type)?.icon ?? Type;
                return (
                  <div key={q.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono shrink-0 w-4">{idx + 1}.</span>
                      <Input
                        value={q.text}
                        onChange={e => updateQuestion(idx, { text: e.target.value })}
                        placeholder="Question text"
                        className="flex-1 h-7 text-sm"
                      />
                      {/* Type selector */}
                      <select
                        value={q.type}
                        onChange={e => updateQuestion(idx, { type: e.target.value as Question['type'] })}
                        className="h-7 rounded-md border border-border bg-background text-xs px-1.5 shrink-0"
                      >
                        {Q_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">Req</span>
                        <Switch checked={q.required} onCheckedChange={v => updateQuestion(idx, { required: v })} className="scale-75" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive shrink-0" onClick={() => removeQuestion(idx)} disabled={questions.length === 1}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Options for choice type */}
                    {q.type === 'choice' && (
                      <div className="pl-10 space-y-1.5">
                        <p className="text-[10px] text-muted-foreground font-medium">Options (one per line, max 10)</p>
                        <Textarea
                          value={(q.options ?? []).join('\n')}
                          onChange={e => updateQuestion(idx, { options: e.target.value.split('\n').filter(Boolean) })}
                          placeholder={'Option A\nOption B\nOption C'}
                          rows={3}
                          className="text-xs resize-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Completion Message</Label>
              <Textarea
                value={formData.completion_message ?? ''}
                onChange={e => setQ('completion_message', e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Send from a conversation using the "Send Form" button in the chat header.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" className="bg-brand-500 hover:bg-brand-600" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update Form' : 'Create Form'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Forms list */}
      {forms.length === 0 && !showForm ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No forms yet</p>
          <p className="text-xs mt-1">Create a form to start collecting responses via WhatsApp.</p>
        </div>
      ) : !showForm && forms.map(f => (
        <div key={f.id} className={cn('rounded-xl border border-border bg-card p-4 space-y-3', !f.is_active && 'opacity-60')}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-brand-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{f.name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{f.questions.length} questions</Badge>
                </div>
                {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><BarChart2 className="h-3 w-3" /> {f.total_responses} responses</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch checked={f.is_active} onCheckedChange={() => void handleToggle(f)} />
              <Button size="icon" variant="ghost" className="h-7 w-7" title="View responses" onClick={() => setViewingResp(f)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(f)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => void handleDelete(f.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Question preview */}
          <div className="flex gap-1.5 flex-wrap pl-12">
            {f.questions.slice(0, 5).map((q) => {
              const meta = Q_TYPES.find(t => t.value === q.type);
              const Icon = meta?.icon ?? Type;
              return (
                <span key={q.id} className="flex items-center gap-1 text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                  <Icon className="h-2.5 w-2.5" /> {q.text.slice(0, 25) || 'Untitled'}
                </span>
              );
            })}
            {f.questions.length > 5 && <span className="text-[10px] text-muted-foreground">+{f.questions.length - 5} more</span>}
          </div>
        </div>
      ))}

      {/* Responses dialog */}
      <Dialog open={!!viewingResp} onOpenChange={v => { if (!v) setViewingResp(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <DialogTitle className="text-base">{viewingResp?.name} — Responses</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            {!respData ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
            ) : respData.responses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No responses yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left px-3 py-2 font-semibold rounded-tl-lg">Contact</th>
                      {respData.form.questions.map(q => (
                        <th key={q.id} className="text-left px-3 py-2 font-semibold min-w-28">{q.text.slice(0, 20)}</th>
                      ))}
                      <th className="text-left px-3 py-2 font-semibold rounded-tr-lg">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {respData.responses.map((r, i) => (
                      <tr key={r.id} className={cn('border-t border-border', i % 2 === 0 ? '' : 'bg-muted/30')}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{r.contact_name ?? '—'}</p>
                          <p className="text-muted-foreground">{r.contact_phone ?? ''}</p>
                        </td>
                        {respData.form.questions.map(q => (
                          <td key={q.id} className="px-3 py-2 max-w-40 truncate">{r.answers[q.id] ?? '—'}</td>
                        ))}
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(r.submitted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

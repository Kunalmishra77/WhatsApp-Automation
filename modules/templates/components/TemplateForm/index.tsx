'use client';

import { useEffect, useRef, useState } from 'react';
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
import {
  Paperclip, X, Loader2, Image, Video, FileText, Plus, Trash2,
  Link, Phone, MessageSquare, Timer, LayoutGrid, List, Copy, ChevronDown, ChevronUp,
} from 'lucide-react';
import { WhatsAppPreview } from '../WhatsAppPreview';
import { useCreateTemplate, useUpdateTemplate } from '../../hooks/useTemplates';
import { extractVariables } from '../../services/template.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { TemplateRow } from '../../services/template.service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type HeaderType    = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type ButtonType    = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';
type TemplateMode  = 'standard' | 'lto' | 'carousel' | 'list';
type CardHeaderType = 'IMAGE' | 'VIDEO' | 'NONE';

interface TemplateButton { type: ButtonType; text: string; value: string; }

interface CarouselCard {
  body:        string;
  header_type: CardHeaderType;
  buttons:     Array<{ type: 'QUICK_REPLY' | 'URL'; text: string; value: string }>;
}

interface ListRow     { id: string; title: string; description: string; }
interface ListSection { title: string; rows: ListRow[]; }

const BTN_MAX = 3;
const CARD_MAX = 10;
const CARD_MIN = 2;

const BTN_ICONS: Record<ButtonType, React.ElementType> = {
  QUICK_REPLY:  MessageSquare,
  URL:          Link,
  PHONE_NUMBER: Phone,
  COPY_CODE:    Copy,
};
const BTN_LABELS: Record<ButtonType, string> = {
  QUICK_REPLY:  'Quick Reply',
  URL:          'URL / Link',
  PHONE_NUMBER: 'Phone Number',
  COPY_CODE:    'Copy Code (Coupon)',
};

const HEADER_ACCEPT: Record<HeaderType, string> = {
  NONE: '', TEXT: '', IMAGE: 'image/jpeg,image/png,image/webp', VIDEO: 'video/mp4', DOCUMENT: 'application/pdf',
};
const HEADER_ICON: Record<HeaderType, React.ElementType | null> = {
  NONE: null, TEXT: null, IMAGE: Image, VIDEO: Video, DOCUMENT: FileText,
};

const TEMPLATE_MODES: Array<{ value: TemplateMode; label: string; icon: React.ElementType; desc: string }> = [
  { value: 'standard',  label: 'Standard',          icon: MessageSquare, desc: 'Text, image, video or document' },
  { value: 'lto',       label: 'Limited Time Offer', icon: Timer,         desc: 'Countdown timer + coupon code' },
  { value: 'carousel',  label: 'Carousel',           icon: LayoutGrid,    desc: '2–10 scrollable product cards' },
  { value: 'list',      label: 'Interactive List',   icon: List,          desc: 'Menu with multiple options' },
];

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

function blankCard(): CarouselCard {
  return { body: '', header_type: 'IMAGE', buttons: [] };
}
function blankRow(): ListRow {
  return { id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: '', description: '' };
}
function blankSection(): ListSection {
  return { title: '', rows: [blankRow()] };
}

export function TemplateForm({ open, onClose, template }: TemplateFormProps) {
  const isEdit      = !!template;
  const create      = useCreateTemplate();
  const update      = useUpdateTemplate();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  // Standard mode state
  const [headerType,    setHeaderType]    = useState<HeaderType>('NONE');
  const [mediaHandle,   setMediaHandle]   = useState('');
  const [mediaFileName, setMediaFileName] = useState('');
  const [isUploading,   setIsUploading]   = useState(false);
  const [buttons,       setButtons]       = useState<TemplateButton[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Template mode
  const [templateMode, setTemplateMode] = useState<TemplateMode>('standard');

  // Carousel state
  const [cards, setCards] = useState<CarouselCard[]>([blankCard(), blankCard()]);
  const [cardUploading, setCardUploading] = useState<Record<number, boolean>>({});

  // Interactive List state
  const [listButtonText, setListButtonText]   = useState('');
  const [listSections,   setListSections]     = useState<ListSection[]>([blankSection()]);

  const addButton = () => {
    if (buttons.length >= BTN_MAX) return;
    setButtons((b) => [...b, { type: 'QUICK_REPLY', text: '', value: '' }]);
  };
  const removeButton  = (i: number) => setButtons((b) => b.filter((_, idx) => idx !== i));
  const updateButton  = (i: number, patch: Partial<TemplateButton>) =>
    setButtons((b) => b.map((btn, idx) => idx === i ? { ...btn, ...patch } : btn));

  // Carousel helpers
  const addCard    = () => { if (cards.length < CARD_MAX) setCards((c) => [...c, blankCard()]); };
  const removeCard = (i: number) => { if (cards.length > CARD_MIN) setCards((c) => c.filter((_, idx) => idx !== i)); };
  const updateCard = (i: number, patch: Partial<CarouselCard>) =>
    setCards((c) => c.map((card, idx) => idx === i ? { ...card, ...patch } : card));
  const addCardButton = (ci: number) => {
    const c = cards[ci];
    if (!c || c.buttons.length >= 2) return;
    updateCard(ci, { buttons: [...c.buttons, { type: 'QUICK_REPLY', text: '', value: '' }] });
  };
  const removeCardButton = (ci: number, bi: number) => {
    const c = cards[ci];
    if (!c) return;
    updateCard(ci, { buttons: c.buttons.filter((_, idx) => idx !== bi) });
  };
  const updateCardButton = (ci: number, bi: number, patch: Partial<CarouselCard['buttons'][0]>) => {
    const c = cards[ci];
    if (!c) return;
    updateCard(ci, { buttons: c.buttons.map((btn, idx) => idx === bi ? { ...btn, ...patch } : btn) });
  };

  // List helpers
  const addSection    = () => setListSections((s) => [...s, blankSection()]);
  const removeSection = (si: number) => {
    if (listSections.length <= 1) return;
    setListSections((s) => s.filter((_, idx) => idx !== si));
  };
  const updateSection = (si: number, patch: Partial<ListSection>) =>
    setListSections((s) => s.map((sec, idx) => idx === si ? { ...sec, ...patch } : sec));
  const addRow    = (si: number) => { const s = listSections[si]; if (s) updateSection(si, { rows: [...s.rows, blankRow()] }); };
  const removeRow = (si: number, ri: number) => {
    const s = listSections[si];
    if (!s || s.rows.length <= 1) return;
    updateSection(si, { rows: s.rows.filter((_, idx) => idx !== ri) });
  };
  const updateRow = (si: number, ri: number, patch: Partial<ListRow>) => {
    const s = listSections[si];
    if (!s) return;
    updateSection(si, { rows: s.rows.map((row, idx) => idx === ri ? { ...row, ...patch } : row) });
  };

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        name: '', category: 'marketing', language: 'en',
        header_content: '', body: '', footer: '',
      },
    });

  const [bodyValue, headerTextValue, footerValue, categoryValue] =
    watch(['body', 'header_content', 'footer', 'category']);

  useEffect(() => {
    if (open) {
      const tpl = template as any;
      const ht = (tpl?.header_type as HeaderType | null | undefined) ?? 'NONE';
      setHeaderType(ht || 'NONE');
      setMediaHandle(ht !== 'TEXT' && ht !== 'NONE' ? (tpl?.header_content ?? '') : '');
      setMediaFileName('');
      const existingBtns = Array.isArray(tpl?.buttons) ? tpl.buttons as TemplateButton[] : [];
      setButtons(existingBtns);

      // Detect mode from template data
      if (tpl?.is_carousel && Array.isArray(tpl?.cards)) {
        setTemplateMode('carousel');
        setCards(tpl.cards.length >= CARD_MIN ? tpl.cards : [blankCard(), blankCard()]);
      } else if (tpl?.list_sections) {
        setTemplateMode('list');
        setListButtonText(tpl.list_button_text ?? '');
        setListSections(Array.isArray(tpl.list_sections) ? tpl.list_sections : [blankSection()]);
      } else if (tpl?.has_lto) {
        setTemplateMode('lto');
      } else {
        setTemplateMode('standard');
      }

      reset({
        name:           tpl?.name ?? '',
        category:       tpl?.category ?? 'marketing',
        language:       tpl?.language ?? 'en',
        header_content: ht === 'TEXT' ? (tpl?.header_content ?? '') : '',
        body:           tpl?.body ?? '',
        footer:         tpl?.footer ?? '',
      });
    }
  }, [open, template, reset]);

  const handleMediaUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);
      const res  = await fetch('/api/templates/upload-media', { method: 'POST', body: form });
      const data = await res.json() as { handle?: string; fileName?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setMediaHandle(data.handle ?? '');
      setMediaFileName(data.fileName ?? file.name);
      toast.success('Media uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
  };

  const handleCardMediaUpload = async (ci: number, file: File) => {
    setCardUploading((u) => ({ ...u, [ci]: true }));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);
      const res  = await fetch('/api/templates/upload-media', { method: 'POST', body: form });
      const data = await res.json() as { handle?: string; fileName?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      updateCard(ci, { header_type: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE' });
      toast.success(`Card ${ci + 1} sample uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setCardUploading((u) => ({ ...u, [ci]: false }));
    }
  };

  const onSubmit = async (values: FormValues) => {
    const isCarousel = templateMode === 'carousel';
    const isList     = templateMode === 'list';
    const isLTO      = templateMode === 'lto';

    // Carousel validation
    if (isCarousel) {
      if (cards.some((c) => !c.body.trim())) {
        toast.error('Every card must have a body text'); return;
      }
    }
    // List validation
    if (isList) {
      if (!listButtonText.trim()) { toast.error('Button text is required for list'); return; }
      if (listSections.some((s) => s.rows.some((r) => !r.title.trim()))) {
        toast.error('Every list row must have a title'); return;
      }
    }

    const vars = isCarousel ? [] : extractVariables(values.body);
    const headerContent = headerType === 'TEXT'
      ? (values.header_content ?? '')
      : headerType !== 'NONE' ? mediaHandle : '';

    try {
      const payload = {
        ...values,
        header_type:      isCarousel || isList ? null : (headerType === 'NONE' ? null : headerType),
        header_content:   isCarousel || isList ? null : (headerContent || null),
        variables:        vars,
        has_lto:          isLTO,
        is_carousel:      isCarousel,
        cards:            isCarousel ? cards : null,
        list_button_text: isList ? listButtonText : null,
        list_sections:    isList ? listSections : null,
        buttons:          isCarousel || isList ? [] : buttons.filter((b) => b.text.trim()) as unknown[],
      };

      if (isEdit && template) {
        await update.mutateAsync({ id: template.id, payload: payload as never });
        toast.success('Template saved');
      } else {
        await create.mutateAsync({ ...payload, status: 'pending' } as never);
        toast.success('Template created — submit to Meta for approval');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  const isMeta   = headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT';
  const MediaIcon = isMeta ? HEADER_ICON[headerType] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6">
          <form id="template-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="tname">Template Name</Label>
              <Input id="tname" {...register('name')} placeholder="welcome_message" />
              <p className="text-[11px] text-muted-foreground">Lowercase, numbers, underscores only</p>
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* Category + Language */}
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
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Template Mode */}
            <div className="space-y-2">
              <Label>Template Type</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATE_MODES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setTemplateMode(m.value)}
                      className={cn(
                        'flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors',
                        templateMode === m.value
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-border hover:border-brand-300',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium leading-tight">{m.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{m.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── STANDARD & LTO mode ─────────────────────────────────── */}
            {(templateMode === 'standard' || templateMode === 'lto') && (
              <>
                {templateMode === 'lto' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" /> Limited Time Offer Template
                    </p>
                    <p className="text-[11px] text-amber-700">
                      • Use <code className="font-mono bg-amber-100 px-0.5 rounded">{'{{1}}'}</code> in body for coupon code<br />
                      • Add a <strong>Copy Code</strong> button below<br />
                      • Meta will show countdown timer automatically<br />
                      • Expiry date is set per campaign when sending
                    </p>
                  </div>
                )}

                {/* Header type selector */}
                <div className="space-y-2">
                  <Label>Header <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <div className="flex gap-2 flex-wrap">
                    {(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as HeaderType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setHeaderType(t); setMediaHandle(''); setMediaFileName(''); }}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                          headerType === t
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-border text-muted-foreground hover:border-brand-300',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {headerType === 'TEXT' && (
                    <Input {...register('header_content')} placeholder="Header text (max 60 chars)" maxLength={60} />
                  )}
                  {isMeta && (
                    mediaHandle ? (
                      <div className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 p-3">
                        {MediaIcon && <MediaIcon className="h-4 w-4 text-brand-600 shrink-0" />}
                        <span className="flex-1 text-sm text-brand-700 truncate">{mediaFileName || 'Uploaded'}</span>
                        <button type="button" onClick={() => { setMediaHandle(''); setMediaFileName(''); }} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => mediaInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-sm text-muted-foreground hover:border-brand-300 hover:text-brand-600 transition-colors disabled:opacity-50"
                      >
                        {isUploading
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                          : <><Paperclip className="h-4 w-4" /> Upload {headerType.toLowerCase()} for header</>}
                      </button>
                    )
                  )}
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept={HEADER_ACCEPT[headerType]}
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMediaUpload(f); }}
                  />
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <Label htmlFor="body">Body</Label>
                  <Textarea
                    id="body"
                    {...register('body')}
                    placeholder={templateMode === 'lto'
                      ? 'Get {{1}} off! Use code {{1}} at checkout. Hurry, offer expires soon!'
                      : 'Hello {{1}}, your order {{2}} is ready!'}
                    className="min-h-28 resize-none"
                    maxLength={1024}
                  />
                  {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
                  <p className="text-right text-[11px] text-muted-foreground">{(bodyValue ?? '').length}/1024</p>
                </div>

                {/* Footer */}
                <div className="space-y-1.5">
                  <Label htmlFor="footer">Footer <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input id="footer" {...register('footer')} placeholder="Reply STOP to unsubscribe" maxLength={60} />
                </div>

                {/* Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Buttons <span className="text-muted-foreground text-xs font-normal">(optional, max 3)</span></Label>
                    {buttons.length < BTN_MAX && (
                      <button type="button" onClick={addButton} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                        <Plus className="h-3.5 w-3.5" /> Add button
                      </button>
                    )}
                  </div>
                  {templateMode === 'lto' && buttons.length === 0 && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded-md p-2">
                      Add a <strong>Copy Code</strong> button so users can copy the coupon code.
                    </p>
                  )}
                  {buttons.map((btn, i) => {
                    const BtnIcon = BTN_ICONS[btn.type];
                    return (
                      <div key={i} className="rounded-lg border border-border p-2.5 space-y-2 bg-muted/20">
                        <div className="flex items-center gap-2">
                          <BtnIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <select
                            value={btn.type}
                            onChange={(e) => updateButton(i, { type: e.target.value as ButtonType, value: '' })}
                            className="flex-1 text-xs rounded-md border border-border bg-background px-2 py-1.5 outline-none"
                          >
                            <option value="QUICK_REPLY">Quick Reply</option>
                            <option value="URL">URL / Link</option>
                            <option value="PHONE_NUMBER">Phone Number</option>
                            <option value="COPY_CODE">Copy Code (Coupon)</option>
                          </select>
                          <button type="button" onClick={() => removeButton(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Input
                          value={btn.text}
                          onChange={(e) => updateButton(i, { text: e.target.value })}
                          placeholder={
                            btn.type === 'QUICK_REPLY' ? 'Yes / No / Learn More' :
                            btn.type === 'URL'         ? 'Visit Website' :
                            btn.type === 'COPY_CODE'   ? 'Copy Code' :
                            'Call Us'
                          }
                          maxLength={25}
                          className="h-7 text-xs"
                        />
                        {btn.type === 'URL' && (
                          <Input value={btn.value} onChange={(e) => updateButton(i, { value: e.target.value })}
                            placeholder="https://example.com" className="h-7 text-xs" />
                        )}
                        {btn.type === 'PHONE_NUMBER' && (
                          <Input value={btn.value} onChange={(e) => updateButton(i, { value: e.target.value })}
                            placeholder="+919876543210" className="h-7 text-xs" />
                        )}
                        {btn.type === 'COPY_CODE' && (
                          <p className="text-[11px] text-muted-foreground">Coupon code is provided when sending campaign</p>
                        )}
                      </div>
                    );
                  })}
                  {buttons.length === 0 && templateMode !== 'lto' && (
                    <p className="text-[11px] text-muted-foreground">No buttons. Add Quick Reply, URL or Phone buttons to boost engagement.</p>
                  )}
                </div>

                {categoryValue === 'authentication' && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-blue-800">OTP Template Tips</p>
                    <p className="text-[11px] text-blue-700">
                      • Body: <code className="bg-blue-100 px-0.5 rounded font-mono">{'Your OTP is {{1}}. Valid for 10 minutes.'}</code><br />
                      • Add a <strong>Copy Code</strong> button so users can copy the OTP easily
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ── CAROUSEL mode ───────────────────────────────────────── */}
            {templateMode === 'carousel' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5">
                    <LayoutGrid className="h-3.5 w-3.5" /> Carousel Template
                  </p>
                  <p className="text-[11px] text-purple-700">
                    • 2–10 cards, each with image/video + body text + up to 2 buttons<br />
                    • Actual card images are uploaded per campaign at send time<br />
                    • Requires Meta approval
                  </p>
                </div>

                {/* Common body field removed — each card has its own body */}
                {/* We still need the react-hook-form body field to pass validation */}
                <input type="hidden" {...register('body')} value={cards[0]?.body || ' '} />

                {cards.map((card, ci) => (
                  <div key={ci} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Card {ci + 1}</p>
                      {cards.length > CARD_MIN && (
                        <button type="button" onClick={() => removeCard(ci)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Card header type */}
                    <div className="flex gap-1.5">
                      {(['IMAGE', 'VIDEO', 'NONE'] as CardHeaderType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateCard(ci, { header_type: t })}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                            card.header_type === t
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-border text-muted-foreground hover:border-brand-300',
                          )}
                        >
                          {t === 'NONE' ? 'No Header' : t}
                        </button>
                      ))}
                      {card.header_type !== 'NONE' && (
                        <button
                          type="button"
                          onClick={() => document.getElementById(`card-upload-${ci}`)?.click()}
                          disabled={!!cardUploading[ci]}
                          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-600"
                        >
                          {cardUploading[ci]
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Paperclip className="h-3 w-3" />}
                          Sample
                        </button>
                      )}
                      <input
                        id={`card-upload-${ci}`}
                        type="file"
                        accept={card.header_type === 'VIDEO' ? 'video/mp4' : 'image/jpeg,image/png,image/webp'}
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleCardMediaUpload(ci, f); }}
                      />
                    </div>

                    {/* Card body */}
                    <Textarea
                      value={card.body}
                      onChange={(e) => updateCard(ci, { body: e.target.value })}
                      placeholder="Card body text… supports {{1}} variables"
                      className="min-h-16 resize-none text-xs"
                      maxLength={160}
                    />

                    {/* Card buttons (max 2) */}
                    <div className="space-y-1.5">
                      {card.buttons.map((btn, bi) => (
                        <div key={bi} className="flex gap-1.5 items-center">
                          <select
                            value={btn.type}
                            onChange={(e) => updateCardButton(ci, bi, { type: e.target.value as 'QUICK_REPLY' | 'URL', value: '' })}
                            className="text-[11px] rounded border border-border bg-background px-1.5 py-1 outline-none"
                          >
                            <option value="QUICK_REPLY">Quick Reply</option>
                            <option value="URL">URL</option>
                          </select>
                          <Input
                            value={btn.text}
                            onChange={(e) => updateCardButton(ci, bi, { text: e.target.value })}
                            placeholder="Button text"
                            maxLength={20}
                            className="h-7 text-xs flex-1"
                          />
                          {btn.type === 'URL' && (
                            <Input
                              value={btn.value}
                              onChange={(e) => updateCardButton(ci, bi, { value: e.target.value })}
                              placeholder="https://…"
                              className="h-7 text-xs flex-1"
                            />
                          )}
                          <button type="button" onClick={() => removeCardButton(ci, bi)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {card.buttons.length < 2 && (
                        <button type="button" onClick={() => addCardButton(ci)} className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-0.5">
                          <Plus className="h-3 w-3" /> Add button
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {cards.length < CARD_MAX && (
                  <button
                    type="button"
                    onClick={addCard}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-3 text-xs text-muted-foreground hover:border-brand-300 hover:text-brand-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Card ({cards.length}/{CARD_MAX})
                  </button>
                )}
              </div>
            )}

            {/* ── INTERACTIVE LIST mode ────────────────────────────────── */}
            {templateMode === 'list' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                    <List className="h-3.5 w-3.5" /> Interactive List Template
                  </p>
                  <p className="text-[11px] text-blue-700">
                    • Only for contacts with active 24h WhatsApp session<br />
                    • Great for service menus, product selection, booking slots<br />
                    • No Meta approval required — sent directly
                  </p>
                </div>

                <input type="hidden" {...register('body')} value={bodyValue || 'Choose from the options below'} />

                {/* Body */}
                <div className="space-y-1.5">
                  <Label>Message Body</Label>
                  <Textarea
                    value={bodyValue ?? ''}
                    onChange={(e) => setValue('body', e.target.value)}
                    placeholder="Please choose from the options below:"
                    className="min-h-20 resize-none text-xs"
                    maxLength={1024}
                  />
                </div>

                {/* List button text */}
                <div className="space-y-1.5">
                  <Label>List Button Text <span className="text-muted-foreground text-xs">(max 20 chars)</span></Label>
                  <Input
                    value={listButtonText}
                    onChange={(e) => setListButtonText(e.target.value.slice(0, 20))}
                    placeholder="Select Option"
                    maxLength={20}
                  />
                </div>

                {/* Sections */}
                {listSections.map((sec, si) => (
                  <div key={si} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={sec.title}
                        onChange={(e) => updateSection(si, { title: e.target.value })}
                        placeholder={`Section ${si + 1} title (optional)`}
                        className="h-7 text-xs flex-1"
                        maxLength={24}
                      />
                      {listSections.length > 1 && (
                        <button type="button" onClick={() => removeSection(si)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {sec.rows.map((row, ri) => (
                      <div key={ri} className="ml-2 space-y-1 rounded-md border border-border bg-background p-2">
                        <div className="flex gap-1.5 items-center">
                          <Input
                            value={row.title}
                            onChange={(e) => updateRow(si, ri, { title: e.target.value })}
                            placeholder="Option title"
                            className="h-6 text-xs flex-1"
                            maxLength={24}
                          />
                          {sec.rows.length > 1 && (
                            <button type="button" onClick={() => removeRow(si, ri)} className="text-muted-foreground hover:text-destructive shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <Input
                          value={row.description}
                          onChange={(e) => updateRow(si, ri, { description: e.target.value })}
                          placeholder="Description (optional)"
                          className="h-6 text-xs"
                          maxLength={72}
                        />
                      </div>
                    ))}
                    <button type="button" onClick={() => addRow(si)} className="text-[11px] text-brand-600 flex items-center gap-0.5">
                      <Plus className="h-3 w-3" /> Add row
                    </button>
                  </div>
                ))}
                {listSections.length < 10 && (
                  <button type="button" onClick={addSection} className="text-xs text-brand-600 flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add section
                  </button>
                )}
              </div>
            )}

          </form>

          {/* Live Preview */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>

            {templateMode === 'carousel' ? (
              <CarouselPreview cards={cards} />
            ) : templateMode === 'list' ? (
              <ListPreview
                body={bodyValue || ''}
                listButtonText={listButtonText || 'Select Option'}
                sections={listSections}
              />
            ) : (
              <WhatsAppPreview
                headerType={headerType}
                headerText={headerType === 'TEXT' ? (headerTextValue || undefined) : undefined}
                mediaFileName={isMeta && mediaHandle ? (mediaFileName || headerType) : undefined}
                buttons={buttons.filter((b) => b.text.trim()).map((b) => ({ type: b.type, text: b.text }))}
                body={bodyValue || ''}
                footer={footerValue || undefined}
                hasLTO={templateMode === 'lto'}
              />
            )}

            {templateMode === 'standard' && extractVariables(bodyValue ?? '').length > 0 && (
              <p className="text-xs text-muted-foreground">
                Variables: {extractVariables(bodyValue ?? '').join(', ')}
              </p>
            )}
            {templateMode === 'standard' && isMeta && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-md p-2">
                ⚠️ Media header requires Meta approval. Upload a sample image/video for the template — actual media can differ when sending campaigns.
              </p>
            )}
            {templateMode === 'carousel' && (
              <p className="text-[11px] text-purple-600 bg-purple-50 rounded-md p-2">
                ⚠️ Carousel requires Meta approval. Card images are uploaded per campaign at send time.
              </p>
            )}
            {templateMode === 'lto' && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-md p-2">
                ⚠️ LTO requires Meta approval. Expiry date and coupon code are set per campaign.
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

// ── Carousel Preview ──────────────────────────────────────────────────────────
function CarouselPreview({ cards }: { cards: CarouselCard[] }) {
  const [activeCard, setActiveCard] = useState(0);
  const card = cards[activeCard] ?? cards[0] ?? { body: '', header_type: 'IMAGE' as CardHeaderType, buttons: [] };
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-[#e5ddd5] p-4">
      <div className="w-64 rounded-2xl bg-white shadow-lg overflow-hidden">
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-[#128c7e]" />
          <div>
            <p className="text-xs font-semibold text-white">Business Name</p>
            <p className="text-[10px] text-white/70">Online</p>
          </div>
        </div>
        <div className="min-h-32 bg-[#e5ddd5] p-3">
          <div className="max-w-[90%] rounded-b-xl rounded-tr-xl bg-white shadow-sm overflow-hidden">
            {card.header_type !== 'NONE' && (
              <div className={cn('flex h-24 w-full items-center justify-center', card.header_type === 'VIDEO' ? 'bg-[#1c2b33]' : 'bg-[#f0f2f5]')}>
                {card.header_type === 'IMAGE' ? <Image className="h-6 w-6 text-[#8696a0]" /> : <Video className="h-6 w-6 text-white/60" />}
              </div>
            )}
            <div className="p-2.5">
              <p className="text-[12px] text-[#111b21] leading-snug">{card.body || 'Card body text…'}</p>
              {card.buttons.length > 0 && (
                <div className="mt-2 border-t border-[#e9edef] pt-1.5 space-y-1">
                  {card.buttons.map((btn, i) => (
                    <div key={i} className="rounded bg-[#f0f2f5] px-2 py-1 text-center text-[11px] font-medium text-[#00a884]">{btn.text || 'Button'}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Card nav dots */}
          <div className="flex justify-center gap-1 mt-2">
            {cards.map((_, i) => (
              <button key={i} type="button" onClick={() => setActiveCard(i)}
                className={cn('h-1.5 rounded-full transition-all', i === activeCard ? 'w-4 bg-[#075e54]' : 'w-1.5 bg-[#8696a0]/50')}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Interactive List Preview ──────────────────────────────────────────────────
function ListPreview({ body, listButtonText, sections }: { body: string; listButtonText: string; sections: ListSection[] }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-[#e5ddd5] p-4">
      <div className="w-64 rounded-2xl bg-white shadow-lg overflow-hidden">
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-[#128c7e]" />
          <div>
            <p className="text-xs font-semibold text-white">Business Name</p>
            <p className="text-[10px] text-white/70">Online</p>
          </div>
        </div>
        <div className="min-h-32 bg-[#e5ddd5] p-3">
          <div className="max-w-[85%] rounded-b-xl rounded-tr-xl bg-white p-2.5 shadow-sm">
            <p className="text-[13px] text-[#111b21] whitespace-pre-wrap leading-snug">{body || 'Message body…'}</p>
            <p className="mt-1 text-right text-[10px] text-[#667781]">12:00 ✓✓</p>
            <div className="mt-2 border-t border-[#e9edef] pt-1.5">
              <div className="flex items-center justify-center gap-1 text-[12px] font-medium text-[#00a884]">
                <List className="h-3.5 w-3.5" /> {listButtonText || 'Select Option'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

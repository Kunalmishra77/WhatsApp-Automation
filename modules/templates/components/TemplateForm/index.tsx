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
import { Paperclip, X, Loader2, Image, Video, FileText } from 'lucide-react';
import { WhatsAppPreview } from '../WhatsAppPreview';
import { useCreateTemplate, useUpdateTemplate } from '../../hooks/useTemplates';
import { extractVariables } from '../../services/template.service';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { TemplateRow } from '../../services/template.service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

const HEADER_ACCEPT: Record<HeaderType, string> = {
  NONE:     '',
  TEXT:     '',
  IMAGE:    'image/jpeg,image/png,image/webp',
  VIDEO:    'video/mp4',
  DOCUMENT: 'application/pdf',
};

const HEADER_ICON: Record<HeaderType, React.ElementType | null> = {
  NONE: null, TEXT: null, IMAGE: Image, VIDEO: Video, DOCUMENT: FileText,
};

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

export function TemplateForm({ open, onClose, template }: TemplateFormProps) {
  const isEdit      = !!template;
  const create      = useCreateTemplate();
  const update      = useUpdateTemplate();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';

  const [headerType,    setHeaderType]    = useState<HeaderType>('NONE');
  const [mediaHandle,   setMediaHandle]   = useState('');   // WhatsApp media handle (for Meta example)
  const [mediaFileName, setMediaFileName] = useState('');
  const [isUploading,   setIsUploading]   = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        name:           template?.name ?? '',
        category:       template?.category ?? 'marketing',
        language:       template?.language ?? 'en',
        header_content: (template?.header_type === 'TEXT' ? template?.header_content : '') ?? '',
        body:           template?.body ?? '',
        footer:         template?.footer ?? '',
      },
    });

  const [bodyValue, headerTextValue, footerValue, categoryValue] =
    watch(['body', 'header_content', 'footer', 'category']);

  useEffect(() => {
    if (open) {
      const ht = (template?.header_type as HeaderType | null | undefined) ?? 'NONE';
      setHeaderType(ht || 'NONE');
      setMediaHandle(ht !== 'TEXT' && ht !== 'NONE' ? (template?.header_content ?? '') : '');
      setMediaFileName('');
      reset({
        name:           template?.name ?? '',
        category:       template?.category ?? 'marketing',
        language:       template?.language ?? 'en',
        header_content: ht === 'TEXT' ? (template?.header_content ?? '') : '',
        body:           template?.body ?? '',
        footer:         template?.footer ?? '',
      });
    }
  }, [open, template, reset]);

  const handleMediaUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);
      const res  = await fetch('/api/campaigns/upload-media', { method: 'POST', body: form });
      const data = await res.json() as { mediaId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setMediaHandle(data.mediaId ?? '');
      setMediaFileName(file.name);
      toast.success('Media uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
  };

  const onSubmit = async (values: FormValues) => {
    const vars = extractVariables(values.body);
    // header_content stores text for TEXT type, media handle for media types
    const headerContent = headerType === 'TEXT'
      ? (values.header_content ?? '')
      : headerType !== 'NONE'
        ? mediaHandle
        : '';

    try {
      const payload = {
        ...values,
        header_type:    headerType === 'NONE' ? null : headerType,
        header_content: headerContent || null,
        variables:      vars,
      };
      if (isEdit && template) {
        await update.mutateAsync({ id: template.id, payload });
        toast.success('Template saved');
      } else {
        await create.mutateAsync({ ...payload, status: 'pending', buttons: [] });
        toast.success('Template created — submit to Meta for approval');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  const isMeta = headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT';
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
                placeholder="Hello {{1}}, your order {{2}} is ready!"
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
          </form>

          {/* Live Preview */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>
            <WhatsAppPreview
              headerType={headerType}
              headerText={headerType === 'TEXT' ? (headerTextValue || undefined) : undefined}
              mediaFileName={isMeta && mediaHandle ? (mediaFileName || headerType) : undefined}
              body={bodyValue || ''}
              footer={footerValue || undefined}
            />
            {extractVariables(bodyValue ?? '').length > 0 && (
              <p className="text-xs text-muted-foreground">
                Variables: {extractVariables(bodyValue ?? '').join(', ')}
              </p>
            )}
            {isMeta && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-md p-2">
                ⚠️ Media header requires Meta approval. Upload a sample image/video for the template — actual media can differ when sending campaigns.
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

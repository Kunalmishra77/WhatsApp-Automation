'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, CheckCircle2, ImageIcon, Video, FileText, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTemplates } from '@/modules/templates/hooks/useTemplates';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ContactRow } from '../../services/contact.service';

const MEDIA_HEADER_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;

function mediaIcon(type: string) {
  if (type === 'IMAGE')    return <ImageIcon className="h-3.5 w-3.5 text-blue-500" />;
  if (type === 'VIDEO')    return <Video className="h-3.5 w-3.5 text-purple-500" />;
  if (type === 'DOCUMENT') return <FileText className="h-3.5 w-3.5 text-orange-500" />;
  return null;
}

interface StartConversationDialogProps {
  contact: ContactRow | null;
  open: boolean;
  onClose: () => void;
}

export function StartConversationDialog({ contact, open, onClose }: StartConversationDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [sending, setSending] = useState(false);
  const router = useRouter();

  const { data: templates = [] } = useTemplates();
  const approvedTemplates = templates.filter((t) => t.status === 'approved');

  const selectedTemplate = approvedTemplates.find((t) => t.id === selectedTemplateId);
  const headerType = selectedTemplate?.header_type?.toUpperCase() ?? '';
  const needsMedia = MEDIA_HEADER_TYPES.includes(headerType as typeof MEDIA_HEADER_TYPES[number]);

  // Preview: replace {{1}} with contact name, {{2}} with phone
  const previewBody = selectedTemplate?.body
    ? selectedTemplate.body
        .replace(/\{\{1\}\}/g, contact?.name ?? contact?.phone ?? 'Customer')
        .replace(/\{\{2\}\}/g, contact?.phone ?? '')
    : '';

  const handleSend = async () => {
    if (!contact || !selectedTemplateId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/start-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, mediaUrl: mediaUrl.trim() || undefined }),
      });
      const data = await res.json() as { success?: boolean; conversationId?: string; error?: string };

      if (!res.ok) throw new Error(data.error ?? 'Failed to send');

      toast.success('Message sent! Opening conversation…');
      onClose();
      if (data.conversationId) {
        router.push(`/conversations/${data.conversationId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSelectedTemplateId('');
    setMediaUrl('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand-500" />
            Start Conversation with {contact?.name ?? contact?.phone}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
          {/* WhatsApp rule notice */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <strong>WhatsApp Rule:</strong> First message must use an approved template. After they reply, you can send free-form messages for 24 hours.
          </div>

          {approvedTemplates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No approved templates found.</p>
              <p className="text-xs text-muted-foreground mt-1">Go to Templates → Sync from Meta, or wait for Meta to approve your templates.</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select Template</p>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {approvedTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        selectedTemplateId === t.id
                          ? 'border-brand-500 bg-brand-500/5'
                          : 'border-border hover:border-brand-300',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono font-medium">{t.name}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] h-4 capitalize">{t.category}</Badge>
                          <Badge variant="outline" className="text-[10px] h-4 uppercase">{t.language}</Badge>
                          {selectedTemplateId === t.id && (
                            <CheckCircle2 className="h-4 w-4 text-brand-500" />
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Media URL input — shown only when template has IMAGE/VIDEO/DOCUMENT header */}
              {needsMedia && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    {mediaIcon(headerType)}
                    <Label className="text-xs font-medium text-amber-800">
                      {headerType} URL <span className="text-red-500">*</span>
                    </Label>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Is template ka {headerType.toLowerCase()} header hai — public URL paste karo jo WhatsApp fetch kar sake.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder={`https://example.com/file.${headerType === 'IMAGE' ? 'jpg' : headerType === 'VIDEO' ? 'mp4' : 'pdf'}`}
                      className={cn('text-xs', mediaUrl && 'border-green-400 bg-green-50/50')}
                    />
                    <div className="flex items-center">
                      <Link className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  {mediaUrl && (
                    <p className="text-[11px] text-green-700">✓ URL set</p>
                  )}
                </div>
              )}

              {/* Live preview */}
              {selectedTemplate && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                  <div className="rounded-lg bg-[#ECE5DD] p-3 max-h-56 overflow-y-auto">
                    <div className="rounded-lg bg-white px-3 py-2 shadow-sm max-w-xs">
                      {selectedTemplate.header_content && (
                        <p className="text-sm font-semibold text-foreground mb-1">{selectedTemplate.header_content}</p>
                      )}
                      <p className="text-sm text-foreground whitespace-pre-wrap">{previewBody}</p>
                      {selectedTemplate.footer && (
                        <p className="text-[11px] text-muted-foreground mt-1">{selectedTemplate.footer}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            disabled={!selectedTemplateId || sending || (needsMedia && !mediaUrl.trim())}
            onClick={() => void handleSend()}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {sending ? 'Sending…' : 'Send & Open Chat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

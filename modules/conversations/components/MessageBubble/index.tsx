'use client';

import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock, List, Languages, Loader2, MousePointerClick, Play, FileText, Music, X, Download } from 'lucide-react';
import { useState } from 'react';
import type { MessageRow } from '../../services/message.service';
import type { Json } from '@/types/database.types';

interface MessageBubbleProps {
  message: MessageRow;
  conversationId?: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued:    <Clock className="h-3 w-3" />,
  sent:      <Check className="h-3 w-3" />,
  delivered: <CheckCheck className="h-3 w-3" />,
  read:      <CheckCheck className="h-3 w-3 text-brand-400" />,
  failed:    <span className="text-[10px] text-destructive">!</span>,
};

interface InteractivePayload {
  type?: 'button' | 'list';
  body?: { text?: string };
  header?: { text?: string };
  footer?: { text?: string };
  action?: {
    buttons?: Array<{ type?: string; reply?: { id?: string; title?: string } }>;
    button?: string;
    sections?: Array<{ title?: string; rows?: Array<{ id?: string; title?: string; description?: string }> }>;
  };
}

interface InteractiveMetadata {
  interactive_type?: 'button' | 'list';
  payload?: InteractivePayload;
  // Inbound: customer clicked a button or selected a list item
  interactive_reply?: {
    type?: 'button_reply' | 'list_reply';
    id?: string;
    title?: string;
    description?: string;
  };
}

function parseInteractiveMeta(meta: Json): InteractiveMetadata | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return meta as unknown as InteractiveMetadata;
}

export function MessageBubble({ message, conversationId }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isNote = message.type === 'internal_note';
  const isInteractive = message.type === 'interactive';
  const time = format(new Date(message.created_at), 'HH:mm');

  const [translated, setTranslated] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);

  const canTranslate = !isOutbound && !isNote && !isInteractive && !!message.content;

  const handleTranslate = async () => {
    if (translated) {
      setShowTranslated((v) => !v);
      return;
    }
    setIsTranslating(true);
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content, conversationId }),
      });
      const data = await res.json() as { translated?: string; detectedLang?: string };
      if (data.translated) {
        setTranslated(data.translated);
        setDetectedLang(data.detectedLang ?? null);
        setShowTranslated(true);
      }
    } catch { /* silent */ }
    setIsTranslating(false);
  };

  const displayContent = showTranslated && translated ? translated : message.content;

  const [lightbox, setLightbox] = useState(false);

  // Media fields
  const mediaUrl      = (message as any).media_url as string | null;
  const mediaMime     = (message as any).media_mime_type as string | null ?? '';
  const mediaFilename = (message as any).media_filename as string | null;
  const isImageMsg    = message.type === 'image' || mediaMime.startsWith('image/');
  const isVideoMsg    = message.type === 'video' || mediaMime.startsWith('video/');
  const isAudioMsg    = message.type === 'audio' || mediaMime.startsWith('audio/');
  const isDocMsg      = message.type === 'document' || mediaMime.startsWith('application/');
  const hasMedia      = !!(mediaUrl && (isImageMsg || isVideoMsg || isAudioMsg || isDocMsg));

  const interactiveMeta = isInteractive ? parseInteractiveMeta(message.metadata) : null;
  const interactiveType    = interactiveMeta?.interactive_type;
  const interactivePayload = interactiveMeta?.payload;
  const interactiveReply   = interactiveMeta?.interactive_reply; // inbound customer click
  const replyButtons = interactiveType === 'button' ? (interactivePayload?.action?.buttons ?? []) : [];

  return (
    <div className={cn('flex flex-col', isOutbound ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
          isOutbound && !isNote && 'rounded-br-sm bg-brand-500 text-white',
          !isOutbound && 'rounded-bl-sm bg-card text-foreground border border-border',
          isNote && 'rounded-br-sm bg-amber-50 border border-amber-200 text-amber-900',
          isInteractive && isOutbound && 'px-0 py-0 overflow-hidden bg-brand-500',
          isInteractive && !isOutbound && 'px-0 py-0 overflow-hidden',
        )}
      >
        {isNote && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Internal Note
          </p>
        )}

        {/* ── Media preview ── */}
        {hasMedia && (
          <div className="mb-1">
            {isImageMsg && (
              <button
                onClick={() => setLightbox(true)}
                className="block w-full overflow-hidden rounded-xl"
                style={{ maxWidth: 260 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl!}
                  alt={mediaFilename ?? 'image'}
                  className="w-full object-cover rounded-xl hover:opacity-90 transition-opacity"
                  style={{ maxHeight: 220 }}
                  loading="lazy"
                />
              </button>
            )}
            {isVideoMsg && (
              <div className="relative overflow-hidden rounded-xl bg-black/20" style={{ maxWidth: 260 }}>
                <video src={mediaUrl!} className="w-full rounded-xl" style={{ maxHeight: 180 }} controls preload="metadata" />
              </div>
            )}
            {isAudioMsg && (
              <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2', isOutbound ? 'bg-white/15' : 'bg-muted')}>
                <div className="h-8 w-8 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                  <Music className="h-4 w-4 text-brand-500" />
                </div>
                <audio src={mediaUrl!} controls className="h-7 flex-1 min-w-0" style={{ maxWidth: 160 }} />
              </div>
            )}
            {isDocMsg && (
              <a
                href={mediaUrl!}
                download={mediaFilename ?? true}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-opacity hover:opacity-80',
                  isOutbound ? 'bg-white/15 text-white' : 'bg-muted text-foreground',
                )}
                style={{ maxWidth: 260 }}
              >
                <div className="h-9 w-9 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-brand-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{mediaFilename ?? 'Document'}</p>
                  <p className="text-[10px] opacity-60">Tap to download</p>
                </div>
                <Download className="h-4 w-4 opacity-50 shrink-0" />
              </a>
            )}
          </div>
        )}

        {/* ── Inbound: customer clicked a button or selected a list item ── */}
        {isInteractive && !isOutbound && interactiveReply ? (
          <div className="px-3.5 py-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-brand-500 uppercase tracking-wide">
              <MousePointerClick className="h-3 w-3" />
              {interactiveReply.type === 'list_reply' ? 'Selected' : 'Clicked'}
            </div>
            <p className="text-[13px] font-medium">{interactiveReply.title}</p>
            {interactiveReply.description && (
              <p className="text-[11px] text-muted-foreground">{interactiveReply.description}</p>
            )}
            <div className="flex items-center justify-end gap-1 text-muted-foreground">
              <span className="text-[10px]">{time}</span>
            </div>
          </div>
        ) : isInteractive ? (
          <>
            {interactivePayload?.header?.text && (
              <div
                className={cn(
                  'px-3.5 pt-2.5 pb-1 font-semibold text-[13px] border-b',
                  isOutbound
                    ? 'text-white border-white/20'
                    : 'text-foreground border-border',
                )}
              >
                {interactivePayload.header.text}
              </div>
            )}

            <div className="px-3.5 py-2">
              {message.content && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>

            {interactivePayload?.footer?.text && (
              <div
                className={cn(
                  'px-3.5 pb-1 text-[11px]',
                  isOutbound ? 'text-white/60' : 'text-muted-foreground',
                )}
              >
                {interactivePayload.footer.text}
              </div>
            )}

            <div
              className={cn(
                'px-3.5 pb-2 flex items-center justify-end gap-1',
                isOutbound ? 'text-white/70' : 'text-muted-foreground',
              )}
            >
              <span className="text-[10px]">{time}</span>
              {isOutbound && STATUS_ICON[message.status]}
            </div>

            {interactiveType === 'button' && replyButtons.length > 0 && (
              <div
                className={cn(
                  'border-t',
                  isOutbound ? 'border-white/20' : 'border-border',
                )}
              >
                {replyButtons.map((btn, idx) => (
                  <div
                    key={btn.reply?.id ?? idx}
                    className={cn(
                      'px-3.5 py-2 text-center text-[13px] font-medium',
                      idx < replyButtons.length - 1 && (isOutbound ? 'border-b border-white/20' : 'border-b border-border'),
                      isOutbound ? 'text-white/90' : 'text-brand-500',
                    )}
                  >
                    {btn.reply?.title ?? ''}
                  </div>
                ))}
              </div>
            )}

            {interactiveType === 'list' && (
              <div
                className={cn(
                  'border-t px-3.5 py-2 flex items-center justify-center gap-1.5 text-[13px] font-medium',
                  isOutbound ? 'border-white/20 text-white/90' : 'border-border text-brand-500',
                )}
              >
                <List className="h-3.5 w-3.5" />
                {interactivePayload?.action?.button ?? 'View list'}
              </div>
            )}
          </>
        ) : (
          <>
            {displayContent && (
              <p className="whitespace-pre-wrap break-words">{displayContent}</p>
            )}
            {showTranslated && detectedLang && detectedLang !== 'en' && (
              <p className="mt-0.5 text-[10px] text-muted-foreground italic">
                Translated from {detectedLang.toUpperCase()}
              </p>
            )}
            <div
              className={cn(
                'mt-1 flex items-center justify-end gap-1',
                isOutbound && !isNote ? 'text-white/70' : 'text-muted-foreground',
              )}
            >
              <span className="text-[10px]">{time}</span>
              {isOutbound && !isNote && STATUS_ICON[message.status]}
            </div>
          </>
        )}
      </div>

      {/* Image lightbox */}
      {lightbox && mediaUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <a
            href={mediaUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="absolute top-4 right-16 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <Download className="h-4 w-4" />
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={mediaFilename ?? 'image'}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Translate toggle for inbound messages */}
      {canTranslate && (
        <button
          onClick={() => void handleTranslate()}
          disabled={isTranslating}
          className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-brand-500 transition-colors"
        >
          {isTranslating
            ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
            : <Languages className="h-2.5 w-2.5" />}
          {isTranslating
            ? 'Translating…'
            : showTranslated
              ? 'Show original'
              : 'Translate'}
        </button>
      )}
    </div>
  );
}

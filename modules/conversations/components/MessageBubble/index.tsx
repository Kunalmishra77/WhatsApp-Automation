import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock, List } from 'lucide-react';
import type { MessageRow } from '../../services/message.service';
import type { Json } from '@/types/database.types';

interface MessageBubbleProps {
  message: MessageRow;
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
}

function parseInteractiveMeta(meta: Json): InteractiveMetadata | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return meta as unknown as InteractiveMetadata;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isNote = message.type === 'internal_note';
  const isInteractive = message.type === 'interactive';
  const time = format(new Date(message.created_at), 'HH:mm');

  const interactiveMeta = isInteractive ? parseInteractiveMeta(message.metadata) : null;
  const interactiveType = interactiveMeta?.interactive_type;
  const interactivePayload = interactiveMeta?.payload;
  const replyButtons = interactiveType === 'button' ? (interactivePayload?.action?.buttons ?? []) : [];

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
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

        {isInteractive ? (
          <>
            {/* Interactive header */}
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

            {/* Body */}
            <div className="px-3.5 py-2">
              {message.content && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>

            {/* Footer */}
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

            {/* Timestamp row */}
            <div
              className={cn(
                'px-3.5 pb-2 flex items-center justify-end gap-1',
                isOutbound ? 'text-white/70' : 'text-muted-foreground',
              )}
            >
              <span className="text-[10px]">{time}</span>
              {isOutbound && STATUS_ICON[message.status]}
            </div>

            {/* Quick reply buttons */}
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

            {/* List indicator */}
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
            {message.content && (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
    </div>
  );
}

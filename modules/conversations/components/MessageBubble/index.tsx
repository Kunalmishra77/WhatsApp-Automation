import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock } from 'lucide-react';
import type { MessageRow } from '../../services/message.service';

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

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isNote = message.type === 'internal_note';
  const time = format(new Date(message.created_at), 'HH:mm');

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
          isOutbound && !isNote && 'rounded-br-sm bg-brand-500 text-white',
          !isOutbound && 'rounded-bl-sm bg-card text-foreground border border-border',
          isNote && 'rounded-br-sm bg-amber-50 border border-amber-200 text-amber-900',
        )}
      >
        {isNote && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Internal Note
          </p>
        )}
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
      </div>
    </div>
  );
}

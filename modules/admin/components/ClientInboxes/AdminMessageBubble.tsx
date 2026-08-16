'use client';

// Lightweight chat bubble for the platform-admin Client Inboxes thread view.
// Intentionally NOT the workspace-facing MessageBubble (that one is coupled to
// member-context endpoints: /api/ai/translate, /api/messages/[id]/feedback).
// Inbound = left/white, outbound = right/orange. Messages the platform admin
// sent (metadata.platform_admin_send) get a distinct purple treatment + label so
// the owner can tell oversight replies apart from the client's own agents/bot.
import { format } from 'date-fns';
import { Check, CheckCheck, Clock, ShieldAlert, FileText, Download } from 'lucide-react';
import type { AdminMessage } from './types';

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued: <Clock className="h-3 w-3" />,
  sent: <Check className="h-3 w-3" />,
  delivered: <CheckCheck className="h-3 w-3" />,
  read: <CheckCheck className="h-3 w-3 text-sky-300" />,
  failed: <span className="text-[10px] font-bold text-red-200">!</span>,
};

function safeTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'MMM d, HH:mm');
}

export function AdminMessageBubble({ message }: { message: AdminMessage }) {
  const isOutbound = message.direction === 'outbound';
  const isAdminSend = message.metadata?.platform_admin_send === true;
  const isFailed = message.status === 'failed';
  const time = safeTime(message.created_at);

  const mediaUrl = message.media_url ?? null;
  const mime = message.media_mime_type ?? '';
  const isImage = mediaUrl && (message.type === 'image' || mime.startsWith('image/'));
  const isOtherMedia = mediaUrl && !isImage;

  // Bubble color: admin-send (purple) > outbound (orange) > inbound (white).
  const bubbleClass = isAdminSend
    ? 'rounded-br-sm bg-violet-600 text-white'
    : isOutbound
      ? 'rounded-br-sm bg-[#F97316] text-white'
      : 'rounded-bl-sm bg-white text-gray-900 border border-gray-200';

  const metaTextClass = isOutbound || isAdminSend ? 'text-white/70' : 'text-gray-400';

  return (
    <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
      {isAdminSend && (
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
          <ShieldAlert className="h-3 w-3" />
          Sent by platform admin
        </div>
      )}
      <div className={`relative max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${bubbleClass}`}>
        {isImage && (
          <a href={mediaUrl!} target="_blank" rel="noopener noreferrer" className="mb-1 block overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl!}
              alt={message.media_filename ?? 'image'}
              className="max-h-56 w-full rounded-xl object-cover"
              loading="lazy"
            />
          </a>
        )}
        {isOtherMedia && (
          <a
            href={mediaUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className={`mb-1 flex items-center gap-2 rounded-xl px-3 py-2 ${
              isOutbound || isAdminSend ? 'bg-white/15' : 'bg-gray-100'
            }`}
          >
            <FileText className="h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate text-xs">{message.media_filename ?? 'Attachment'}</span>
            <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </a>
        )}

        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}

        <div className={`mt-1 flex items-center justify-end gap-1 ${metaTextClass}`}>
          <span className="text-[10px]">{time}</span>
          {(isOutbound || isAdminSend) && STATUS_ICON[message.status]}
        </div>
      </div>
      {isFailed && (
        <span className="mt-0.5 text-[10px] font-medium text-red-500">Failed to send</span>
      )}
    </div>
  );
}

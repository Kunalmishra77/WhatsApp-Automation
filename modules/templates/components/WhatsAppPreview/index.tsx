import { Video, FileText, Timer, Copy } from 'lucide-react';

interface WhatsAppPreviewProps {
  headerType?:      string;
  headerText?:      string;
  mediaFileName?:   string;
  mediaPreviewUrl?: string;   // blob URL or https URL — highest priority
  mediaId?:         string;   // WhatsApp media ID or https URL — used if no previewUrl
  workspaceId?:     string;   // required to proxy WhatsApp media IDs
  header?:          string;   // legacy — treated as TEXT
  body:             string;
  footer?:          string;
  buttons?:         Array<{ type: string; text: string }>;
  hasLTO?:          boolean;  // Limited Time Offer — shows countdown banner
}

export function WhatsAppPreview({
  headerType,
  headerText,
  mediaFileName,
  mediaPreviewUrl,
  mediaId,
  workspaceId,
  header,
  body,
  footer,
  buttons,
  hasLTO,
}: WhatsAppPreviewProps) {
  const renderText = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (_, n) => `[Variable ${n}]`);

  const resolvedHeaderType = headerType ?? (header ? 'TEXT' : 'NONE');
  const resolvedHeaderText = headerText ?? header ?? '';

  // Resolve the best available image source
  const getImgSrc = (): string | null => {
    if (mediaPreviewUrl) return mediaPreviewUrl;
    if (!mediaId) return null;
    if (mediaId.startsWith('http://') || mediaId.startsWith('https://')) return mediaId;
    // WhatsApp numeric media ID — proxy through our API
    if (workspaceId) return `/api/media/proxy?mediaId=${encodeURIComponent(mediaId)}&workspaceId=${encodeURIComponent(workspaceId)}`;
    return null;
  };

  const imgSrc = getImgSrc();

  const MediaPlaceholder = () => {
    if (resolvedHeaderType === 'IMAGE') {
      if (imgSrc) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt="Header" className="mb-1.5 w-full h-28 object-cover rounded-lg"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = 'none';
              if (el.nextSibling) (el.nextSibling as HTMLElement).style.display = 'flex';
            }} />
        );
      }
      return (
        <div className="mb-1.5 flex h-28 w-full items-center justify-center rounded-lg bg-[#f0f2f5]">
          <svg className="h-8 w-8 text-[#8696a0]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          {mediaFileName && <span className="ml-2 text-[10px] text-[#8696a0] truncate max-w-20">{mediaFileName}</span>}
        </div>
      );
    }
    if (resolvedHeaderType === 'VIDEO') {
      if (imgSrc) {
        return (
          <div className="mb-1.5 relative h-28 w-full rounded-lg overflow-hidden bg-[#1c2b33]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc} alt="Video thumbnail" className="w-full h-full object-cover opacity-70"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-9 w-9 rounded-full bg-black/60 flex items-center justify-center">
                <svg className="h-4 w-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="mb-1.5 flex h-28 w-full items-center justify-center rounded-lg bg-[#1c2b33]">
          <Video className="h-8 w-8 text-white/60" />
          {mediaFileName && <span className="ml-2 text-[10px] text-white/60 truncate max-w-20">{mediaFileName}</span>}
        </div>
      );
    }
    if (resolvedHeaderType === 'DOCUMENT') {
      return (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-3 py-2">
          <FileText className="h-5 w-5 text-[#53bdeb] shrink-0" />
          <span className="text-[11px] text-[#111b21] truncate">{mediaFileName || 'document.pdf'}</span>
        </div>
      );
    }
    return null;
  };

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

            {/* LTO countdown banner */}
            {hasLTO && (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-[#fff3e0] px-2.5 py-1.5 border border-[#ffcc80]">
                <Timer className="h-3.5 w-3.5 text-[#e65100] shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold text-[#e65100]">Limited Time Offer</p>
                  <p className="text-[9px] text-[#bf360c]">Offer expires: 2h 30m</p>
                </div>
              </div>
            )}

            <MediaPlaceholder />

            {resolvedHeaderType === 'TEXT' && resolvedHeaderText && (
              <p className="mb-1.5 text-[13px] font-semibold text-[#111b21]">
                {renderText(resolvedHeaderText)}
              </p>
            )}

            <p className="text-[13px] text-[#111b21] whitespace-pre-wrap leading-snug">
              {renderText(body || 'Your message preview will appear here…')}
            </p>
            {footer && (
              <p className="mt-1.5 text-[11px] text-[#667781]">{renderText(footer)}</p>
            )}
            <p className="mt-1 text-right text-[10px] text-[#667781]">12:00 ✓✓</p>

            {buttons && buttons.length > 0 && (
              <div className="mt-2 border-t border-[#e9edef] pt-2 space-y-1">
                {buttons.map((btn, i) => (
                  <div key={i} className="flex items-center justify-center gap-1.5 rounded-md bg-[#f0f2f5] px-2 py-1.5 text-center text-[12px] font-medium text-[#00a884]">
                    {btn.type === 'COPY_CODE' && <Copy className="h-3 w-3" />}
                    {btn.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

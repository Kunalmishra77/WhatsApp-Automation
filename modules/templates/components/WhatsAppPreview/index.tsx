interface WhatsAppPreviewProps {
  header?: string;
  body: string;
  footer?: string;
  buttons?: Array<{ type: string; text: string }>;
}

export function WhatsAppPreview({ header, body, footer, buttons }: WhatsAppPreviewProps) {
  const renderText = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (_, n) => `[Variable ${n}]`);

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
            {header && (
              <p className="mb-1.5 text-[13px] font-semibold text-[#111b21]">
                {renderText(header)}
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
                  <div
                    key={i}
                    className="rounded-md bg-[#f0f2f5] px-2 py-1.5 text-center text-[12px] font-medium text-[#00a884]"
                  >
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

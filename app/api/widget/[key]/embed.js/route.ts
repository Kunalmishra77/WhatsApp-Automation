import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { APP_URL } from '@/lib/constants';

// GET /api/widget/[key]/embed.js
// Returns a self-contained JavaScript snippet that creates the floating WA button.
// Website owners embed: <script src="https://app.aiagentixdev.com/api/widget/KEY/embed.js"></script>
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = createAdminClient() as any;

  const { data: widget } = await db
    .from('chat_widgets')
    .select('phone_number,prefill_message,greeting_text,business_name,avatar_url,button_color,position,button_label,show_label')
    .eq('embed_key', key)
    .eq('is_active', true)
    .single();

  if (!widget) {
    return new NextResponse('// Widget not found or inactive', {
      headers: { 'Content-Type': 'application/javascript' },
    });
  }

  const apiBase    = APP_URL;
  const phone      = (widget.phone_number as string).replace(/[^\d]/g, '');
  const message    = encodeURIComponent(widget.prefill_message ?? '');
  const waUrl      = `https://wa.me/${phone}?text=${message}`;
  const color      = widget.button_color ?? '#25D366';
  const position   = widget.position ?? 'bottom-right';
  const isRight    = position === 'bottom-right';
  const greeting   = (widget.greeting_text as string ?? '').replace(/'/g, "\\'");
  const bizName    = (widget.business_name as string ?? '').replace(/'/g, "\\'");
  const label      = (widget.button_label as string ?? '').replace(/'/g, "\\'");
  const showLabel  = widget.show_label !== false;
  const avatarUrl  = widget.avatar_url ? `'${widget.avatar_url}'` : 'null';

  const js = `
(function() {
  if (window.__agentixWidgetLoaded) return;
  window.__agentixWidgetLoaded = true;

  var color    = '${color}';
  var isRight  = ${isRight};
  var waUrl    = '${waUrl}';
  var greeting = '${greeting}';
  var bizName  = '${bizName}';
  var label    = '${label}';
  var showLabel = ${showLabel};
  var avatar   = ${avatarUrl};
  var apiBase  = '${apiBase}';
  var key      = '${key}';

  // Inject CSS
  var style = document.createElement('style');
  style.textContent = [
    '#agx-widget { position:fixed; bottom:20px; ' + (isRight ? 'right:20px' : 'left:20px') + '; z-index:9999; display:flex; flex-direction:column; align-items:' + (isRight ? 'flex-end' : 'flex-start') + '; gap:10px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }',
    '#agx-popup { background:#fff; border-radius:16px; padding:14px 16px; box-shadow:0 8px 32px rgba(0,0,0,.18); max-width:240px; display:none; animation:agxSlide .2s ease; }',
    '#agx-popup.agx-open { display:block; }',
    '@keyframes agxSlide { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }',
    '#agx-popup-header { display:flex; align-items:center; gap:10px; margin-bottom:8px; }',
    '#agx-popup-avatar { width:36px; height:36px; border-radius:50%; background:' + color + '; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:14px; overflow:hidden; flex-shrink:0; }',
    '#agx-popup-avatar img { width:100%; height:100%; object-fit:cover; }',
    '#agx-popup-name { font-size:13px; font-weight:700; color:#111; }',
    '#agx-popup-online { font-size:11px; color:#25D366; }',
    '#agx-popup-msg { font-size:13px; color:#555; line-height:1.5; margin-bottom:12px; }',
    '#agx-popup-btn { display:block; background:' + color + '; color:#fff; text-decoration:none; text-align:center; border-radius:8px; padding:9px 14px; font-size:13px; font-weight:600; transition:opacity .15s; }',
    '#agx-popup-btn:hover { opacity:.9; }',
    '#agx-popup-close { position:absolute; top:10px; right:12px; cursor:pointer; color:#999; font-size:16px; line-height:1; }',
    '#agx-btn { background:' + color + '; border-radius:28px; padding:' + (showLabel ? '12px 18px' : '14px') + '; display:flex; align-items:center; gap:8px; cursor:pointer; box-shadow:0 4px 20px rgba(0,0,0,.22); transition:transform .15s,box-shadow .15s; border:none; outline:none; }',
    '#agx-btn:hover { transform:scale(1.05); box-shadow:0 6px 24px rgba(0,0,0,.28); }',
    '#agx-btn svg { flex-shrink:0; }',
    '#agx-btn-label { color:#fff; font-size:14px; font-weight:600; white-space:nowrap; }',
  ].join('');
  document.head.appendChild(style);

  // Build widget HTML
  var container = document.createElement('div');
  container.id = 'agx-widget';

  var popupHtml = '<div id="agx-popup" style="position:relative">' +
    '<span id="agx-popup-close" onclick="document.getElementById(\'agx-popup\').classList.remove(\'agx-open\')">&times;</span>' +
    '<div id="agx-popup-header">' +
      '<div id="agx-popup-avatar">' + (avatar ? '<img src="' + avatar + '" alt="" />' : (bizName ? bizName[0].toUpperCase() : 'A')) + '</div>' +
      '<div><div id="agx-popup-name">' + bizName + '</div><div id="agx-popup-online">&#9679; Online</div></div>' +
    '</div>' +
    '<div id="agx-popup-msg">' + greeting + '</div>' +
    '<a id="agx-popup-btn" href="' + waUrl + '" target="_blank" rel="noopener">Open WhatsApp &#8594;</a>' +
    '</div>';

  var btnHtml = '<button id="agx-btn" onclick="' +
    'var p=document.getElementById(\'agx-popup\');p.classList.toggle(\'agx-open\');' +
    'if(p.classList.contains(\'agx-open\')){try{fetch(apiBase+\'/api/widget/\'+key,{method:\'POST\'})}catch(e){}}">' +
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="#fff" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.52 3.66 1.424 5.18L2 22l4.95-1.4A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>' +
      '<path fill="' + color + '" d="M8.5 8.5c.28 0 .56.01.8.02.27.01.57.04.84.64l1.04 2.5c.08.2.03.44-.13.6l-.5.5c-.2.2-.23.5-.08.73.5.79 1.5 1.9 2.44 2.44.23.14.53.12.73-.08l.5-.5c.16-.16.4-.21.6-.13l2.5 1.04c.6.27.63.57.64.84.01.24.02.52.02.8 0 1.1-.9 2-2 2C8.82 20 4 14.18 4 8.5c0-1.1.9-2 2-2h.5c.55 0 1 .45 1 1v.5c0 .28-.22.5-.5.5z"/>' +
    '</svg>' +
    (showLabel ? '<span id="agx-btn-label">' + label + '</span>' : '') +
    '</button>';

  container.innerHTML = popupHtml + btnHtml;
  document.body.appendChild(container);
})();
`.trim();

  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

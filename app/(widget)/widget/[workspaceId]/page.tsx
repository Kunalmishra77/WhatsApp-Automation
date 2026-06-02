import { createAdminClient } from '@/services/supabase/admin';
import { notFound } from 'next/navigation';

interface Props { params: Promise<{ workspaceId: string }> }

export default async function WidgetPage({ params }: Props) {
  const { workspaceId } = await params;
  const db = createAdminClient() as any;

  const { data: ws } = await db
    .from('workspaces')
    .select('name, phone_number_id, brand_color, logo_url')
    .eq('id', workspaceId)
    .single();

  if (!ws) notFound();

  const brandColor = (ws.brand_color as string | null) ?? '#6366f1';
  const wsName     = ws.name as string;
  const phoneId    = ws.phone_number_id as string | null;

  // Build WhatsApp link using phone number from workspace
  const waLink = phoneId
    ? `https://wa.me/${phoneId}?text=${encodeURIComponent('Hi! I would like to get in touch.')}`
    : '#';

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Chat with {wsName}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; background: transparent;
          }
          .widget {
            background: #fff; border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            padding: 24px; max-width: 320px; width: 100%;
            text-align: center; animation: slideUp 0.3s ease;
          }
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .icon {
            width: 56px; height: 56px; border-radius: 50%;
            background: ${brandColor}; display: flex; align-items: center;
            justify-content: center; margin: 0 auto 12px;
          }
          .icon svg { width: 28px; height: 28px; fill: white; }
          h2 { font-size: 16px; font-weight: 600; color: #111; margin-bottom: 6px; }
          p  { font-size: 13px; color: #666; margin-bottom: 20px; line-height: 1.5; }
          .btn {
            display: inline-flex; align-items: center; gap: 8px;
            background: ${brandColor}; color: white; text-decoration: none;
            border-radius: 10px; padding: 12px 24px; font-size: 14px;
            font-weight: 600; transition: opacity 0.2s;
          }
          .btn:hover { opacity: 0.88; }
          .btn svg { width: 18px; height: 18px; fill: white; }
          .badge { font-size: 11px; color: #aaa; margin-top: 14px; }
          .online { display: inline-flex; align-items: center; gap: 5px;
            font-size: 12px; color: #16a34a; margin-bottom: 16px; }
          .dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; animation: pulse 2s infinite; }
          @keyframes pulse {
            0%,100% { opacity: 1; } 50% { opacity: 0.4; }
          }
        `}</style>
      </head>
      <body>
        <div className="widget">
          <div className="icon">
            <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </div>
          <h2>Chat with {wsName}</h2>
          <div className="online"><span className="dot" /> We&apos;re online — typically reply in minutes</div>
          <p>Start a WhatsApp conversation with our team. We&apos;re happy to help!</p>
          <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn">
            <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Start Chat
          </a>
          <p className="badge">Powered by Agentix</p>
        </div>
      </body>
    </html>
  );
}

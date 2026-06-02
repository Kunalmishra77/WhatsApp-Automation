import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/qr-code?workspaceId=&phone=&message=
// Returns a QR code image URL for a WhatsApp deep link.
// Uses api.qrserver.com free service — no package needed.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const phone       = request.nextUrl.searchParams.get('phone');
    const message     = request.nextUrl.searchParams.get('message') ?? '';
    const size        = request.nextUrl.searchParams.get('size') ?? '300';

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    // Build WhatsApp deep link
    const cleanPhone = phone.replace(/\D/g, '');
    const waUrl = message
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/${cleanPhone}`;

    // Build QR code URL using api.qrserver.com (free, no registration)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(waUrl)}&format=png&margin=10`;

    return NextResponse.json({ qrUrl, waUrl });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

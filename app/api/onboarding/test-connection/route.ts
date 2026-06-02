import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/onboarding/test-connection
// Body: { workspaceId, phone_number_id, access_token, test_phone }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, phone_number_id, access_token, test_phone } = await request.json() as {
      workspaceId?: string;
      phone_number_id?: string;
      access_token?: string;
      test_phone?: string;
    };

    if (!workspaceId || !phone_number_id || !access_token || !test_phone) {
      return NextResponse.json(
        { success: false, error: 'workspaceId, phone_number_id, access_token, and test_phone are required' },
        { status: 400 },
      );
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: test_phone,
          type: 'text',
          text: { body: 'Your Agentix WhatsApp connection is working! ✅' },
        }),
      },
    );

    if (res.ok) {
      return NextResponse.json({ success: true });
    }

    const errBody = await res.text().catch(() => '');
    console.error('[onboarding/test-connection] WhatsApp API error:', res.status, errBody);
    return NextResponse.json(
      { success: false, error: 'Invalid credentials or phone number' },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[onboarding/test-connection]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

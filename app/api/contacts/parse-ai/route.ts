import { type NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai-client';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/contacts/parse-ai
// Accepts a file upload, extracts contact information using AI
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const workspaceId = formData.get('workspaceId') as string | null;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_contacts');
    const file     = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    let text = '';

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'pdf') {
      // Convert PDF to text via buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData  = await pdfParse(buffer);
      text = pdfData.text;
    } else {
      text = await file.text();
    }

    if (!text.trim()) {
      return NextResponse.json({ contacts: [] });
    }

    // Truncate to avoid token limits
    const truncated = text.slice(0, 8000);

    const prompt = `Extract all contact information from the following text. Return ONLY a valid JSON array of contact objects with these fields: phone (required, with country code if available), name (optional), email (optional), company (optional).

Rules:
- phone must be a valid phone number (digits, +, spaces, dashes allowed)
- Remove duplicates
- If no valid contacts found, return empty array []
- Return ONLY the JSON array, no explanation

Text to parse:
${truncated}

JSON array:`;

    const content = await callAI(
      [{ role: 'user', content: prompt }],
      { model: 'openai/gpt-4o-mini', maxTokens: 2000, temperature: 0, jsonMode: false },
    );

    if (!content) return NextResponse.json({ contacts: [] });

    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ contacts: [] });

    const contacts = JSON.parse(jsonMatch[0]) as Array<{
      phone?: string; name?: string; email?: string; company?: string;
    }>;

    const valid = contacts
      .filter((c) => c.phone && c.phone.trim().length > 5)
      .map((c) => ({
        phone:   c.phone!.trim(),
        name:    c.name?.trim() || undefined,
        email:   c.email?.trim() || undefined,
        company: c.company?.trim() || undefined,
      }));

    return NextResponse.json({ contacts: valid, ai_used: true, source: file.name });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[contacts/parse-ai]', err);
    return NextResponse.json({ error: 'AI parsing failed', contacts: [] }, { status: 500 });
  }
}

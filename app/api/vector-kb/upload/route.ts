import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { generateEmbeddingsBatch, formatEmbedding } from '@/lib/embeddings';

export const maxDuration = 60;

const ALLOWED_TYPES = ['txt', 'md', 'csv', 'json', 'pdf', 'docx', 'xlsx', 'xls'];

function getFileType(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const cleaned = text.replace(/[^\x20-\x7E\n\r\tऀ-ॿ਀-੿]/g, ' ').trim();
  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const chunk = cleaned.slice(i, i + chunkSize).trim();
    if (chunk.length > 30) chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

async function extractText(file: File, fileType: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (fileType === 'pdf') {
    // Primary: unpdf (pdfjs-based) — works in Vercel serverless, handles all PDF types
    try {
      const { extractText: unpdfExtract } = await import('unpdf');
      const uint8 = new Uint8Array(buffer);
      // mergePages:true → text is string; mergePages:false → text is string[]
      const result = await (unpdfExtract as (d: Uint8Array, o: { mergePages: true }) => Promise<{ text: string }>)(uint8, { mergePages: true });
      if (result.text?.trim().length > 20) return result.text;
    } catch { /* fall through */ }

    // Fallback: pdf-parse lib (avoids test-file load issue on Vercel)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      if (parsed.text?.trim()) return parsed.text;
    } catch { /* fall through */ }

    // Last resort: raw text extraction (strips binary, keeps printable ASCII + Devanagari)
    const raw = buffer.toString('utf8');
    const cleaned = raw.replace(/[^\x20-\x7E\n\rऀ-ॿ]/g, ' ').replace(/\s{4,}/g, '\n').trim();
    return cleaned;
  }

  if (fileType === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (fileType === 'xlsx' || fileType === 'xls') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as {
      read: (buf: Buffer, opts: { type: string }) => unknown;
      utils: {
        book_get_sheet_names: (wb: unknown) => string[];
        sheet_to_csv: (ws: unknown) => string;
      };
    };
    const workbook = XLSX.read(buffer, { type: 'buffer' }) as Record<string, unknown>;
    const sheets = XLSX.utils.book_get_sheet_names(workbook);
    const texts: string[] = [];
    for (const sheetName of sheets) {
      const ws = (workbook as { Sheets: Record<string, unknown> }).Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws);
      if (csv.trim()) texts.push(`[Sheet: ${sheetName}]\n${csv}`);
    }
    return texts.join('\n\n');
  }

  // txt, md, csv, json — plain UTF-8
  return file.text();
}

export async function POST(request: NextRequest) {
  try {
    const formData    = await request.formData();
    const file        = formData.get('file') as File | null;
    const workspaceId = formData.get('workspaceId') as string | null;

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'file and workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const fileType = getFileType(file.name);
    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: `Unsupported file type .${fileType}. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB per file (Vercel limit). Split large documents or upgrade your plan.' }, { status: 413 });
    }

    let text = '';
    try {
      text = await extractText(file, fileType);
    } catch {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'File appears to be empty or contains no readable text' }, { status: 400 });
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No usable text chunks found in file' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // Delete existing chunks for re-upload
    await db.from('vector_documents').delete()
      .eq('workspace_id', workspaceId)
      .eq('filename', file.name);

    // Generate ALL embeddings in one batched API call instead of chunk-by-chunk.
    // Reduces 80+ sequential OpenAI calls → 1 call → stays well within 60s timeout.
    const allEmbeddings = await generateEmbeddingsBatch(chunks);

    const rows = chunks.map((chunk, i) => ({
      workspace_id: workspaceId,
      filename:     file.name,
      file_type:    fileType,
      chunk_index:  i,
      content:      chunk,
      embedding:    allEmbeddings[i] ? formatEmbedding(allEmbeddings[i]!) : null,
    }));

    // Insert in Supabase batches of 200 to stay within payload limits
    let inserted = 0;
    const SUPABASE_BATCH = 200;
    for (let b = 0; b < rows.length; b += SUPABASE_BATCH) {
      const { error } = await db.from('vector_documents').insert(rows.slice(b, b + SUPABASE_BATCH));
      if (!error) inserted += Math.min(SUPABASE_BATCH, rows.length - b);
    }

    return NextResponse.json({
      success:        true,
      filename:       file.name,
      chunks_created: inserted,
      total_chunks:   chunks.length,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[VectorKB Upload]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

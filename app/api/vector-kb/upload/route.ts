import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { generateEmbedding, formatEmbedding } from '@/lib/embeddings';

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text;
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

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 400 });
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

    // Embed in batches of 10
    let inserted = 0;
    const batchSize = 10;

    for (let b = 0; b < chunks.length; b += batchSize) {
      const batch = chunks.slice(b, b + batchSize);
      const rows = await Promise.all(
        batch.map(async (chunk, idx) => {
          const embedding = await generateEmbedding(chunk);
          return {
            workspace_id: workspaceId,
            filename:     file.name,
            file_type:    fileType,
            chunk_index:  b + idx,
            content:      chunk,
            embedding:    embedding ? formatEmbedding(embedding) : null,
          };
        }),
      );
      const { error } = await db.from('vector_documents').insert(rows);
      if (!error) inserted += rows.length;
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

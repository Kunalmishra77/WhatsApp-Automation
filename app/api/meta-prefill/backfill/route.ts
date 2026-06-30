import { NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

async function getWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('workspace_id').eq('id', userId).single();
  return data?.workspace_id ?? null;
}

// POST /api/meta-prefill/backfill
// Scans all existing conversations in the workspace.
// For each conversation whose FIRST inbound message matches a registered pre-fill text,
// sets meta.ad_source and appends "Meta Ad Lead" label (idempotent — skips already-tagged).
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const db = createAdminClient() as any;

  // 1. Load all registered pre-fill texts for this workspace
  const { data: prefills } = await db
    .from('meta_ad_prefill_messages')
    .select('text, template_name')
    .eq('workspace_id', workspaceId);

  if (!prefills || prefills.length === 0) {
    return NextResponse.json({ tagged: 0, skipped: 0, message: 'No pre-fill texts registered yet' });
  }

  // Build a Set for fast O(1) lookup (case-insensitive trimmed)
  const prefillMap = new Map<string, string>(); // normalised text → template_name
  for (const p of prefills) {
    prefillMap.set(p.text.trim().toLowerCase(), p.template_name ?? 'Meta Ad');
  }

  // 2. Fetch all conversations that are NOT already tagged as ad leads
  // Process in pages to handle large workspaces
  let tagged = 0;
  let skipped = 0;
  const CHUNK = 200;
  let offset = 0;

  while (true) {
    // Skip already-tagged conversations using label filter (reliable TEXT[] support)
    const { data: conversations } = await db
      .from('conversations')
      .select('id, meta, labels')
      .eq('workspace_id', workspaceId)
      .not('labels', 'cs', '{"Meta Ad Lead"}')
      .range(offset, offset + CHUNK - 1)
      .order('created_at', { ascending: false });

    if (!conversations || conversations.length === 0) break;

    for (const conv of conversations) {
      // Skip if already tagged as ad lead
      if (conv.meta?.ad_source) { skipped++; continue; }

      // 3. Fetch the FIRST inbound message of this conversation
      const { data: msgs } = await db
        .from('messages')
        .select('content, direction')
        .eq('conversation_id', conv.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: true })
        .limit(1);

      if (!msgs || msgs.length === 0) { skipped++; continue; }

      const firstText = (msgs[0].content ?? '').trim().toLowerCase();
      const matchedTemplate = prefillMap.get(firstText);

      if (!matchedTemplate) { skipped++; continue; }

      // 4. Tag this conversation as Meta Ad Lead
      const adSource = {
        headline:     matchedTemplate,
        body:         null,
        ad_id:        null,
        ctwa_clid:    null,
        source_url:   null,
        platform:     'facebook',
        detected_at:  new Date().toISOString(),
        source:       'prefill_backfill',
      };

      await db
        .from('conversations')
        .update({
          meta: { ...((conv.meta as object) ?? {}), ad_source: adSource },
        })
        .eq('id', conv.id);

      // Ensure workspace label exists
      await db
        .from('workspace_labels')
        .upsert({ workspace_id: workspaceId, name: 'Meta Ad Lead', color: 'blue' },
                 { onConflict: 'workspace_id,name', ignoreDuplicates: true });

      // Append label without overwriting existing ones
      await db.rpc('append_conversation_label', {
        p_conversation_id: conv.id,
        p_label: 'Meta Ad Lead',
      });

      tagged++;
    }

    if (conversations.length < CHUNK) break;
    offset += CHUNK;
  }

  return NextResponse.json({ tagged, skipped, total: tagged + skipped });
}

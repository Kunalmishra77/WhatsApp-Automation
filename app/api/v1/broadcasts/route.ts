import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { validateApiKey, apiUnauthorized } from '@/lib/api-auth';
import { checkApiLimit } from '@/lib/rate-limit';

// POST /api/v1/broadcasts — create and immediately trigger a broadcast
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiUnauthorized();

  const rl = await checkApiLimit(auth.keyId);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const { name, templateId, audienceType = 'all', audienceTag, audienceTags } = await request.json() as {
    name?: string;
    templateId?: string;
    audienceType?: string;
    audienceTag?: string;
    audienceTags?: string[];
  };

  if (!name?.trim() || !templateId?.trim()) {
    return NextResponse.json({ error: 'name and templateId are required' }, { status: 400 });
  }

  const db = createAdminClient() as any;

  // Verify template belongs to workspace and is approved
  const { data: template } = await db
    .from('templates')
    .select('id, status')
    .eq('id', templateId)
    .eq('workspace_id', auth.workspaceId)
    .maybeSingle();

  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (template.status !== 'approved') {
    return NextResponse.json({ error: 'Template must be approved before broadcasting' }, { status: 400 });
  }

  const audienceFilter =
    audienceType === 'tag'  ? { tag: audienceTag } :
    audienceType === 'tags' ? { tags: audienceTags } :
    {};

  // Create campaign as 'scheduled' (immediate — no scheduledAt)
  const { data: campaign, error } = await db
    .from('campaigns')
    .insert({
      workspace_id:    auth.workspaceId,
      name:            name.trim(),
      template_id:     templateId,
      status:          'scheduled',
      audience_type:   audienceType,
      audience_filter: audienceFilter,
      scheduled_at:    new Date().toISOString(),
    })
    .select('id, name, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger execution asynchronously via internal cron endpoint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.aiagentixdev.com';
  void fetch(`${baseUrl}/api/campaigns/${campaign.id as string}/run`, { method: 'POST' }).catch(() => {});

  return NextResponse.json({ data: campaign, message: 'Broadcast queued for execution' }, { status: 202 });
}

// GET /api/v1/broadcasts — list campaigns
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiUnauthorized();

  const rl = await checkApiLimit(auth.keyId);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const db = createAdminClient() as any;
  const { data, error } = await db
    .from('campaigns')
    .select('id, name, status, audience_type, total_recipients, sent_count, failed_count, scheduled_at, completed_at, created_at')
    .eq('workspace_id', auth.workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

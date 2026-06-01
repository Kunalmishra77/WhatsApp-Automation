import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';

export interface DaySchedule {
  day: number;      // 0=Sun, 1=Mon, ..., 6=Sat
  is_open: boolean;
  open: string;     // "HH:MM"
  close: string;    // "HH:MM"
}

export interface BusinessHoursConfig {
  workspace_id: string;
  timezone: string;
  is_enabled: boolean;
  away_message: string;
  schedule: DaySchedule[];
}

// GET /api/business-hours?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    const { data } = await db
      .from('business_hours')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    return NextResponse.json({ config: data ?? null });
  } catch (error) {
    return authzResponse(error);
  }
}

// POST /api/business-hours — upsert
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, timezone, isEnabled, awayMessage, schedule } = await request.json() as {
      workspaceId?: string;
      timezone?: string;
      isEnabled?: boolean;
      awayMessage?: string;
      schedule?: DaySchedule[];
    };

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('business_hours')
      .upsert({
        workspace_id:  workspaceId,
        timezone:      timezone ?? 'Asia/Kolkata',
        is_enabled:    isEnabled ?? false,
        away_message:  awayMessage?.trim() ?? '',
        schedule:      schedule ?? [],
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'workspace_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ config: data });
  } catch (error) {
    return authzResponse(error);
  }
}

// Helper: check if current time is within business hours
export function isWithinBusinessHours(config: BusinessHoursConfig): boolean {
  if (!config.is_enabled) return true; // disabled = always open

  const now = new Date();
  const tz = config.timezone || 'Asia/Kolkata';

  // Get current time in workspace timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const dayName = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';

  const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayNum = DAY_MAP[dayName] ?? 0;
  const currentMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);

  const dayConfig = config.schedule.find((d) => d.day === dayNum);
  if (!dayConfig || !dayConfig.is_open) return false;

  const [openH, openM] = dayConfig.open.split(':').map(Number);
  const [closeH, closeM] = dayConfig.close.split(':').map(Number);
  const openMinutes  = (openH ?? 0)  * 60 + (openM ?? 0);
  const closeMinutes = (closeH ?? 0) * 60 + (closeM ?? 0);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

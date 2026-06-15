import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  const db = createAdminClient() as any;

  // Verify membership
  const { data: member } = await db.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now   = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const week  = new Date(now); week.setDate(now.getDate() - 7);
  const month = new Date(now); month.setDate(now.getDate() - 30);

  // Run all queries in parallel
  const [
    convAll, convOpen, convToday, convBot,
    msgsToday, msgsWeek, msgsBot,
    contactsTotal, contactsNew,
    eventCounts, upcomingEvents,
    recentConvs,
  ] = await Promise.all([
    // Total conversations
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    // Open conversations
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'open'),
    // Conversations started today
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', today.toISOString()),
    // Bot active conversations
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('bot_paused', false).eq('status', 'open'),
    // Messages today
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', today.toISOString()),
    // Messages this week
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', week.toISOString()),
    // Bot replies today
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('sender_type', 'bot').gte('created_at', today.toISOString()),
    // Total contacts
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    // New contacts this month
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', month.toISOString()),
    // Event type counts
    db.from('conversation_events').select('event_type').eq('workspace_id', workspaceId).gte('created_at', month.toISOString()),
    // Upcoming demos/callbacks (pending, last 30 days)
    db.from('conversation_events')
      .select('id, event_type, contact_name, contact_phone, scheduled_at, location, status, created_at')
      .eq('workspace_id', workspaceId)
      .in('event_type', ['demo_booked', 'callback_requested', 'appointment_set'])
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),
    // Recent conversations
    db.from('conversations')
      .select('id, last_message, last_message_at, status, contact:contacts(name, phone)')
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false })
      .limit(5),
  ]);

  // Compute event counts
  const evCounts: Record<string, number> = {};
  for (const row of (eventCounts.data ?? []) as Array<{ event_type: string }>) {
    evCounts[row.event_type] = (evCounts[row.event_type] ?? 0) + 1;
  }

  // Bot reply rate today
  const totalMsgsToday = msgsToday.count ?? 0;
  const botMsgsToday   = msgsBot.count ?? 0;
  const botRate = totalMsgsToday > 0 ? Math.round((botMsgsToday / totalMsgsToday) * 100) : 0;

  return NextResponse.json({
    conversations: {
      total:   convAll.count  ?? 0,
      open:    convOpen.count ?? 0,
      today:   convToday.count ?? 0,
      botActive: convBot.count ?? 0,
    },
    messages: {
      today:    totalMsgsToday,
      thisWeek: msgsWeek.count ?? 0,
      botToday: botMsgsToday,
      botRate,
    },
    contacts: {
      total:   contactsTotal.count ?? 0,
      newMonth: contactsNew.count ?? 0,
    },
    events: {
      demoBooked:        evCounts['demo_booked']        ?? 0,
      callbackRequested: evCounts['callback_requested'] ?? 0,
      appointmentSet:    evCounts['appointment_set']    ?? 0,
      notInterested:     evCounts['not_interested']     ?? 0,
      followUp:          evCounts['follow_up']          ?? 0,
    },
    upcomingEvents: upcomingEvents.data ?? [],
    recentConversations: recentConvs.data ?? [],
  });
}

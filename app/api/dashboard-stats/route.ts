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

  const { data: member } = await db.from('workspace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).single();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now    = new Date();
  const today  = new Date(now); today.setHours(0, 0, 0, 0);
  const week   = new Date(now); week.setDate(now.getDate() - 7);
  const month  = new Date(now); month.setDate(now.getDate() - 30);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  const [
    convOpen, convToday, convYesterday, convTotal, convResolved, convBot, convPending,
    msgsToday, msgsYesterday, msgsWeek, msgsBot, msgsInbound, msgsOutbound,
    contactsTotal, contactsNew, contactsWeek, contactsOptOut,
    eventCounts, upcomingEvents,
    recentConvs, topLabels, campaignStats,
  ] = await Promise.all([
    // Conversations
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'open'),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', today.toISOString()),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'resolved'),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('bot_paused', false).eq('status', 'open'),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'pending'),
    // Messages
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', today.toISOString()),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', week.toISOString()),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('sender_type', 'bot').gte('created_at', today.toISOString()),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('direction', 'inbound').gte('created_at', today.toISOString()),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('direction', 'outbound').gte('created_at', today.toISOString()),
    // Contacts
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', month.toISOString()),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', week.toISOString()),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('opted_out', true),
    // Events
    db.from('conversation_events').select('event_type, status').eq('workspace_id', workspaceId).gte('created_at', month.toISOString()),
    db.from('conversation_events')
      .select('id, event_type, contact_name, contact_phone, scheduled_at, location, status, created_at')
      .eq('workspace_id', workspaceId)
      .in('event_type', ['demo_booked', 'callback_requested', 'appointment_set'])
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(8),
    // Recent conversations
    db.from('conversations')
      .select('id, last_message, last_message_at, status, bot_paused, contact:contacts(name, phone)')
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false })
      .limit(8),
    // Top labels
    db.from('conversation_labels')
      .select('label:labels(name, color)')
      .eq('workspace_id', workspaceId)
      .limit(100),
    // Campaign stats
    db.from('campaigns')
      .select('id, name, status, sent_count, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // Event counts
  const evCounts: Record<string, number>  = {};
  const evPending: Record<string, number> = {};
  for (const row of (eventCounts.data ?? []) as Array<{ event_type: string; status: string }>) {
    evCounts[row.event_type] = (evCounts[row.event_type] ?? 0) + 1;
    if (row.status === 'pending') evPending[row.event_type] = (evPending[row.event_type] ?? 0) + 1;
  }

  // Bot reply rate
  const totalMsgsToday = msgsToday.count ?? 0;
  const botMsgsToday   = msgsBot.count   ?? 0;
  const botRate = totalMsgsToday > 0 ? Math.round((botMsgsToday / totalMsgsToday) * 100) : 0;

  // Day-over-day changes
  const convDelta = (convToday.count ?? 0) - (convYesterday.count ?? 0);
  const msgDelta  = (msgsToday.count ?? 0) - (msgsYesterday.count ?? 0);

  // Label frequency
  const labelFreq: Record<string, { name: string; color: string; count: number }> = {};
  for (const row of (topLabels.data ?? []) as Array<{ label: { name: string; color: string } | null }>) {
    if (!row.label) continue;
    const key = row.label.name;
    if (!labelFreq[key]) labelFreq[key] = { name: row.label.name, color: row.label.color, count: 0 };
    labelFreq[key]!.count++;
  }
  const topLabelList = Object.values(labelFreq).sort((a, b) => b.count - a.count).slice(0, 6);

  return NextResponse.json({
    conversations: {
      open:      convOpen.count      ?? 0,
      today:     convToday.count     ?? 0,
      yesterday: convYesterday.count ?? 0,
      total:     convTotal.count     ?? 0,
      resolved:  convResolved.count  ?? 0,
      pending:   convPending.count   ?? 0,
      botActive: convBot.count       ?? 0,
      delta:     convDelta,
    },
    messages: {
      today:     totalMsgsToday,
      yesterday: msgsYesterday.count ?? 0,
      thisWeek:  msgsWeek.count      ?? 0,
      botToday:  botMsgsToday,
      inbound:   msgsInbound.count   ?? 0,
      outbound:  msgsOutbound.count  ?? 0,
      botRate,
      delta:     msgDelta,
    },
    contacts: {
      total:    contactsTotal.count ?? 0,
      newMonth: contactsNew.count   ?? 0,
      newWeek:  contactsWeek.count  ?? 0,
      optedOut: contactsOptOut.count ?? 0,
    },
    events: {
      demoBooked:        evCounts['demo_booked']        ?? 0,
      callbackRequested: evCounts['callback_requested'] ?? 0,
      appointmentSet:    evCounts['appointment_set']    ?? 0,
      notInterested:     evCounts['not_interested']     ?? 0,
      followUp:          evCounts['follow_up']          ?? 0,
      pendingActions:    Object.values(evPending).reduce((a, b) => a + b, 0),
    },
    upcomingEvents:      upcomingEvents.data ?? [],
    recentConversations: recentConvs.data    ?? [],
    topLabels:           topLabelList,
    recentCampaigns:     campaignStats.data  ?? [],
  });
}

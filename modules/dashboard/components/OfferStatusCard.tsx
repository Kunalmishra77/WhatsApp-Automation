'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { OfferAlert, OfferAlertTone } from '@/lib/offer';

// What price will my bot quote if someone replies right now?
//
// Until this card existed the answer was only on the Knowledge Base page, which
// is where a client goes to set the offer and never again. So Thames ran a
// "Monsoon Offer" into late October, VMS's event pricing sat expired for seven
// weeks, and Fitness First sent a Diwali campaign with no offer at all — none of
// it visible to the person whose leads were being answered wrongly.
//
// The campaign wizard asks the same question at send time. This asks it on the
// dashboard, every time anyone opens it, from the same `offerAlert` so the two
// cannot drift apart.

const TONE: Record<OfferAlertTone, { box: string; icon: typeof Tag; iconColor: string; title: string }> = {
  neutral: { box: 'border-border bg-muted/40',      icon: Tag,            iconColor: 'text-muted-foreground', title: 'text-foreground' },
  good:    { box: 'border-green-200 bg-green-50',   icon: CheckCircle2,   iconColor: 'text-green-600',        title: 'text-green-900' },
  info:    { box: 'border-blue-200 bg-blue-50',     icon: CalendarClock,  iconColor: 'text-blue-600',         title: 'text-blue-900' },
  warn:    { box: 'border-amber-200 bg-amber-50',   icon: AlertTriangle,  iconColor: 'text-amber-600',        title: 'text-amber-900' },
  bad:     { box: 'border-red-200 bg-red-50',       icon: AlertCircle,    iconColor: 'text-red-600',          title: 'text-red-900' },
};

const ACTION_LABEL: Record<OfferAlert['action'], string | null> = {
  set: 'Set an offer',
  add_end_date: 'Add an end date',
  extend_or_replace: 'Update the offer',
  none: null,
};

export function OfferStatusCard() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const { data, isError } = useQuery<{ alert: OfferAlert }>({
    queryKey: ['offer', 'alert', workspaceId],
    queryFn: () =>
      fetch(`/api/offer?workspaceId=${workspaceId}`).then((r) => {
        if (!r.ok) throw new Error('offer');
        return r.json() as Promise<{ alert: OfferAlert }>;
      }),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // A member without manage_workspace gets a 403 here. They also cannot change
  // the offer, so there is nothing for them to act on — say nothing rather than
  // show a problem with no handle on it.
  if (isError || !data) return null;

  const { alert } = data;
  const tone = TONE[alert.tone];
  const Icon = tone.icon;
  const actionLabel = ACTION_LABEL[alert.action];

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', tone.box)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.iconColor)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', tone.title)}>{alert.headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{alert.detail}</p>
      </div>
      {actionLabel && (
        <Link
          href="/knowledge-base"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          {actionLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

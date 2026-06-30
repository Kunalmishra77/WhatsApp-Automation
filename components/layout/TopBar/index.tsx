'use client';

import { Search, Bell, MessageSquare, UserCheck, Sparkles, AlertTriangle, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { useUIStore } from '@/store/ui.store';
import { useNotificationStore } from '@/store/notification.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';
import {
  useNotificationsList, useMarkNotificationRead, useMarkAllNotificationsRead,
  type NotificationRow,
} from '@/hooks/useNotificationsList';
import { formatDistanceToNow } from 'date-fns';

interface TopBarProps {
  className?: string;
}

const NOTIF_ICON: Record<string, React.ElementType> = {
  conversation_assigned: UserCheck,
  lead_assigned:         Sparkles,
  new_message:           MessageSquare,
  sla_breach:            AlertTriangle,
};

function notificationHref(n: NotificationRow): string {
  const data = (n.data ?? {}) as Record<string, unknown>;
  if (n.type === 'lead_assigned') return '/crm';
  if (typeof data.conversation_id === 'string') return `/conversations/${data.conversation_id}`;
  if (n.type === 'conversation_assigned' && typeof data.id === 'string') return `/conversations/${data.id}`;
  return '/conversations';
}

function NotificationsDropdown() {
  const router = useRouter();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { data: notifications = [], isLoading } = useNotificationsList();
  const markRead     = useMarkNotificationRead();
  const markAllRead  = useMarkAllNotificationsRead();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white shadow-sm">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
          )}
          {!isLoading && notifications.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet</p>
          )}
          {notifications.map((n) => {
            const Icon = NOTIF_ICON[n.type] ?? Bell;
            return (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.is_read) void markRead(n.id);
                  router.push(notificationHref(n));
                }}
                className={cn(
                  'flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-accent',
                  !n.is_read && 'bg-brand-50/50',
                )}
              >
                <div className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                  n.is_read ? 'bg-muted text-muted-foreground' : 'bg-brand-100 text-brand-600',
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-xs leading-snug', n.is_read ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ''}
                  </p>
                </div>
                {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TopBar({ className }: TopBarProps) {
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const workspace            = useWorkspaceStore((s) => s.activeWorkspace);

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/90 backdrop-blur-sm px-4 sm:px-6',
        className,
      )}
    >
      {/* Left — workspace badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/60" />
          {workspace?.name ?? 'Agentix'}
        </span>
      </div>

      {/* Right — search + notifications */}
      <div className="flex items-center gap-1">
        {/* Search button — pill style */}
        <button
          onClick={toggleCommandPalette}
          className="hidden md:flex items-center gap-2 h-8 rounded-lg border border-border bg-muted/60 px-3 text-xs text-muted-foreground hover:border-border/80 hover:bg-muted transition-all"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="ml-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/70">
            ⌘K
          </kbd>
        </button>

        {/* Mobile search icon */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCommandPalette}
          className="md:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Notifications */}
        <NotificationsDropdown />
      </div>
    </header>
  );
}

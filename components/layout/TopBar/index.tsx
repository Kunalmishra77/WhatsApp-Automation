'use client';

import { Search, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui.store';
import { useNotificationStore } from '@/store/notification.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';

interface TopBarProps {
  className?: string;
}

export function TopBar({ className }: TopBarProps) {
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const unreadCount          = useNotificationStore((s) => s.unreadCount);
  const workspace            = useWorkspaceStore((s) => s.activeWorkspace);

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4',
        className,
      )}
    >
      {/* Left */}
      <p className="text-sm font-medium text-muted-foreground">
        {workspace?.name ?? 'Agentix'}
      </p>

      {/* Right */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCommandPalette}
          className="h-8 gap-2 text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
          <span className="hidden text-xs md:inline">Search</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono md:inline">
            ⌘K
          </kbd>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}

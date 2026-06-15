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
      </div>
    </header>
  );
}

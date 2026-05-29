'use client';

import { useNotifications } from '@/hooks/useNotifications';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MobileNav } from '@/components/layout/MobileNav';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useNotifications();

  return (
    <div className="flex h-screen overflow-hidden bg-surface-secondary">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar />
      </div>

      {/* Main content column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className={cn('flex-1 overflow-auto', 'pb-16 md:pb-0')}>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* Global command palette */}
      <CommandPalette />
    </div>
  );
}

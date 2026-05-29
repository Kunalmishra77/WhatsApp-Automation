# Agentix Phase 4 — Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the enterprise dashboard shell — collapsible Sidebar with navigation, TopBar with workspace name/notifications/user menu, Command Palette (Cmd+K), and mobile bottom nav — then wire them into the `(dashboard)` layout replacing the placeholder.

**Architecture:** AppShell is a Client Component that reads `useUIStore` for sidebar collapsed state; Sidebar renders nav items with `usePathname` for active detection; TopBar shows user info from `useAuthStore` and notification badge from `useNotificationStore`; Command Palette uses the `cmdk` package already installed. All layout components live in `components/layout/`.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS 3.4, shadcn/ui (Button, Avatar, Badge, Separator, Tooltip, DropdownMenu), cmdk, lucide-react, Zustand (useUIStore, useAuthStore, useNotificationStore), next/navigation (usePathname).

---

## File Map

### New files
```
components/layout/Sidebar/index.tsx          — collapsible sidebar with nav + user section
components/layout/Sidebar/NavItem.tsx        — single nav item (icon + label + active state)
components/layout/TopBar/index.tsx           — top bar (workspace name, search, notifs, user)
components/layout/CommandPalette/index.tsx   — cmdk command palette (Cmd+K)
components/layout/MobileNav/index.tsx        — bottom tab bar for mobile (<768px)
components/layout/AppShell/index.tsx         — outer shell: sidebar + topbar + content slot
```

### Modified files
```
app/(dashboard)/layout.tsx                   — replace placeholder aside with <AppShell>
app/(dashboard)/page.tsx                     — dashboard home: KPI metric cards
```

---

## Task 1: NavItem Component

**Files:**
- Create: `d:\WhatsApp-Automation\components\layout\Sidebar\NavItem.tsx`

- [ ] **Step 1: Write NavItem**

Write `d:\WhatsApp-Automation\components\layout\Sidebar\NavItem.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItemProps {
  href:      string;
  icon:      LucideIcon;
  label:     string;
  collapsed: boolean;
  badge?:    number;
}

export function NavItem({ href, icon: Icon, label, collapsed, badge }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  const content = (
    <Link
      href={href}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-brand-500/10 text-brand-600'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        collapsed && 'justify-center px-2',
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-500" />
      )}

      <Icon
        className={cn(
          'h-5 w-5 shrink-0 transition-colors',
          isActive ? 'text-brand-500' : 'text-muted-foreground group-hover:text-foreground',
        )}
      />

      {!collapsed && (
        <span className="flex-1 truncate">{label}</span>
      )}

      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] text-white">
              {badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add components/layout/Sidebar/NavItem.tsx
git commit -m "feat: add NavItem component with active state, badge, and collapsed tooltip"
```

---

## Task 2: Sidebar Component

**Files:**
- Create: `d:\WhatsApp-Automation\components\layout\Sidebar\index.tsx`

- [ ] **Step 1: Write Sidebar**

Write `d:\WhatsApp-Automation\components\layout\Sidebar\index.tsx`:

```typescript
'use client';

import Link from 'next/link';
import {
  MessageSquare, Users, Kanban, Megaphone, FileText,
  BarChart3, Settings, UserCircle, ChevronLeft, ChevronRight,
  LayoutDashboard, Users2,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavItem } from './NavItem';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { signOutAction } from '@/app/actions/auth.actions';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { href: '/contacts',      icon: Users,         label: 'Contacts'      },
  { href: '/crm',           icon: Kanban,        label: 'CRM Pipeline'  },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns'     },
  { href: '/templates',     icon: FileText,      label: 'Templates'     },
  { href: '/team',          icon: Users2,        label: 'Team'          },
  { href: '/analytics',     icon: BarChart3,     label: 'Analytics'     },
] as const;

export function Sidebar() {
  const collapsed      = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar  = useUIStore((s) => s.toggleSidebar);
  const user           = useAuthStore((s) => s.user);
  const workspace      = useWorkspaceStore((s) => s.activeWorkspace);

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'relative flex h-full flex-col border-r border-border bg-card transition-all duration-200',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-16 shrink-0 items-center border-b border-border px-4',
          collapsed && 'justify-center px-2',
        )}>
          <Link href="/conversations" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white shadow-sm shadow-brand-500/30">
              A
            </div>
            {!collapsed && (
              <span className="truncate font-semibold text-foreground">
                {workspace?.name ?? 'Agentix'}
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
            />
          ))}

          <Separator className="my-2" />

          <NavItem
            href="/settings"
            icon={Settings}
            label="Settings"
            collapsed={collapsed}
          />
        </nav>

        {/* User section */}
        <div className={cn(
          'shrink-0 border-t border-border p-2',
          collapsed && 'flex justify-center',
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent',
                  collapsed && 'justify-center w-auto',
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={user?.avatar_url ?? undefined} alt={user?.full_name ?? ''} />
                  <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user?.full_name ?? 'User'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuItem asChild>
                <Link href="/settings/profile" className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => { void signOutAction(); }}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Collapse toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSidebar}
          className="absolute -right-3.5 top-20 z-10 h-7 w-7 rounded-full border border-border bg-card shadow-sm"
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronLeft  className="h-3.5 w-3.5" />
          }
        </Button>
      </aside>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add components/layout/Sidebar/
git commit -m "feat: build collapsible Sidebar with nav items, user menu, and workspace name"
```

---

## Task 3: Command Palette

**Files:**
- Create: `d:\WhatsApp-Automation\components\layout\CommandPalette\index.tsx`

- [ ] **Step 1: Write CommandPalette**

Write `d:\WhatsApp-Automation\components\layout\CommandPalette\index.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Users, Kanban, Megaphone,
  FileText, BarChart3, Settings, Users2,
} from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { useUIStore } from '@/store/ui.store';

const PAGES = [
  { href: '/conversations', icon: MessageSquare, label: 'Conversations', group: 'Navigate' },
  { href: '/contacts',      icon: Users,         label: 'Contacts',      group: 'Navigate' },
  { href: '/crm',           icon: Kanban,        label: 'CRM Pipeline',  group: 'Navigate' },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns',     group: 'Navigate' },
  { href: '/templates',     icon: FileText,      label: 'Templates',     group: 'Navigate' },
  { href: '/team',          icon: Users2,        label: 'Team',          group: 'Navigate' },
  { href: '/analytics',     icon: BarChart3,     label: 'Analytics',     group: 'Navigate' },
  { href: '/settings',      icon: Settings,      label: 'Settings',      group: 'Navigate' },
] as const;

export function CommandPalette() {
  const open               = useUIStore((s) => s.commandPaletteOpen);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const router             = useRouter();

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleCommandPalette]);

  function runCommand(fn: () => void) {
    toggleCommandPalette();
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={toggleCommandPalette}>
      <CommandInput placeholder="Search pages, contacts, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {PAGES.map(({ href, icon: Icon, label }) => (
            <CommandItem
              key={href}
              value={label}
              onSelect={() => runCommand(() => router.push(href))}
              className="gap-2"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="new conversation"
            onSelect={() => runCommand(() => router.push('/conversations'))}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            New Conversation
          </CommandItem>
          <CommandItem
            value="new contact"
            onSelect={() => runCommand(() => router.push('/contacts'))}
            className="gap-2"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            New Contact
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add components/layout/CommandPalette/
git commit -m "feat: add cmdk Command Palette with Cmd+K shortcut and navigation actions"
```

---

## Task 4: TopBar Component

**Files:**
- Create: `d:\WhatsApp-Automation\components\layout\TopBar\index.tsx`

- [ ] **Step 1: Write TopBar**

Write `d:\WhatsApp-Automation\components\layout\TopBar\index.tsx`:

```typescript
'use client';

import { Search, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      {/* Left: workspace name / breadcrumb */}
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {workspace?.name ?? 'Agentix'}
        </p>
      </div>

      {/* Right: search + notifications */}
      <div className="flex items-center gap-1">
        {/* Search trigger */}
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

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 p-0 text-[9px] font-bold text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add components/layout/TopBar/
git commit -m "feat: add TopBar with search trigger, Cmd+K hint, and notification badge"
```

---

## Task 5: Mobile Bottom Nav

**Files:**
- Create: `d:\WhatsApp-Automation\components\layout\MobileNav\index.tsx`

- [ ] **Step 1: Write MobileNav**

Write `d:\WhatsApp-Automation\components\layout\MobileNav\index.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare, Users, Kanban, Megaphone, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const MOBILE_NAV = [
  { href: '/conversations', icon: MessageSquare, label: 'Chats'     },
  { href: '/contacts',      icon: Users,         label: 'Contacts'  },
  { href: '/crm',           icon: Kanban,        label: 'CRM'       },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns' },
  { href: '/settings',      icon: Settings,      label: 'Settings'  },
] satisfies Array<{ href: string; icon: LucideIcon; label: string }>;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-border bg-card md:hidden">
      {MOBILE_NAV.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors',
              isActive
                ? 'text-brand-600'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn('h-5 w-5', isActive && 'text-brand-500')} />
            <span className="font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add components/layout/MobileNav/
git commit -m "feat: add MobileNav bottom tab bar for screens < md breakpoint"
```

---

## Task 6: AppShell Component

**Files:**
- Create: `d:\WhatsApp-Automation\components\layout\AppShell\index.tsx`

- [ ] **Step 1: Write AppShell**

Write `d:\WhatsApp-Automation\components\layout\AppShell\index.tsx`:

```typescript
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
  useNotifications(); // wire realtime notification badge globally

  return (
    <div className="flex h-screen overflow-hidden bg-surface-secondary">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar />
      </div>

      {/* Main content column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main
          className={cn(
            'flex-1 overflow-auto',
            'pb-16 md:pb-0', // bottom padding on mobile for MobileNav
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* Command palette (global) */}
      <CommandPalette />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add components/layout/AppShell/
git commit -m "feat: compose AppShell — Sidebar + TopBar + MobileNav + CommandPalette + realtime notifications"
```

---

## Task 7: Wire AppShell into Dashboard Layout

**Files:**
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\layout.tsx`

- [ ] **Step 1: Replace placeholder layout with AppShell**

Write `d:\WhatsApp-Automation\app\(dashboard)\layout.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { ROUTES } from '@/lib/constants';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await getUser();
  if (!user) redirect(ROUTES.LOGIN);

  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect(ROUTES.WORKSPACE_NEW);

  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add "app/(dashboard)/layout.tsx"
git commit -m "feat: wire AppShell into dashboard layout with server-side auth guard"
```

---

## Task 8: Dashboard Home Page

**Files:**
- Modify: `d:\WhatsApp-Automation\app\(dashboard)\page.tsx`

- [ ] **Step 1: Replace placeholder with KPI metric cards**

Write `d:\WhatsApp-Automation\app\(dashboard)\page.tsx`:

```typescript
import type { Metadata } from 'next';
import {
  MessageSquare, Users, TrendingUp, CheckCircle2,
  Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

interface KPICardProps {
  title:   string;
  value:   string;
  change:  string;
  trend:   'up' | 'down' | 'neutral';
  icon:    React.ElementType;
  iconBg:  string;
}

function KPICard({ title, value, change, trend, icon: Icon, iconBg }: KPICardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-label text-muted-foreground">{title}</p>
          <p className="text-display-lg font-bold text-foreground">{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {trend === 'up' && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
        {trend === 'down' && <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />}
        <span
          className={cn(
            'text-label font-medium',
            trend === 'up' && 'text-emerald-600',
            trend === 'down' && 'text-destructive',
            trend === 'neutral' && 'text-muted-foreground',
          )}
        >
          {change}
        </span>
        <span className="text-label text-muted-foreground">vs last week</span>
      </div>
    </div>
  );
}

const KPIS: KPICardProps[] = [
  {
    title:  'Open Conversations',
    value:  '0',
    change: '—',
    trend:  'neutral',
    icon:   MessageSquare,
    iconBg: 'bg-brand-500',
  },
  {
    title:  'Total Contacts',
    value:  '0',
    change: '—',
    trend:  'neutral',
    icon:   Users,
    iconBg: 'bg-violet-500',
  },
  {
    title:  'Active Leads',
    value:  '0',
    change: '—',
    trend:  'neutral',
    icon:   TrendingUp,
    iconBg: 'bg-amber-500',
  },
  {
    title:  'Resolved Today',
    value:  '0',
    change: '—',
    trend:  'neutral',
    icon:   CheckCircle2,
    iconBg: 'bg-emerald-500',
  },
];

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-heading-lg font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-body-md text-muted-foreground">
          Welcome back — here's what's happening today.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <KPICard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-heading-md font-semibold text-foreground">Recent Activity</h2>
          </div>
          <p className="text-body-md text-muted-foreground">
            Activity feed will populate as conversations come in.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-heading-md font-semibold text-foreground">Team Status</h2>
          </div>
          <p className="text-body-md text-muted-foreground">
            Online agents and queue health will display here.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add "app/(dashboard)/page.tsx"
git commit -m "feat: build dashboard home with 4-column KPI grid and activity/team placeholders"
```

---

## Task 9: Build Verification + Live Screenshots

- [ ] **Step 1: TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: Zero errors.

- [ ] **Step 2: Production build**

```powershell
cd "d:\WhatsApp-Automation"; npm run build 2>&1 | Select-Object -Last 20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Start dev server and screenshot dashboard**

Start dev server, then navigate to `http://localhost:3000/conversations` (should redirect to login).  
Sign in, then navigate to `http://localhost:3000` — should show full AppShell with sidebar, topbar, KPI cards.

- [ ] **Step 4: Final commit**

```powershell
cd "d:\WhatsApp-Automation"
git add -A
git commit -m "chore: Phase 4 complete — dashboard shell verified"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| Sidebar with navigation items | ✅ | Task 2 |
| Collapsible sidebar (64px ↔ 256px) | ✅ | Task 2 |
| Active route highlighting | ✅ | Task 1 |
| User avatar + dropdown (profile, logout) | ✅ | Task 2 |
| Workspace name in sidebar | ✅ | Task 2 |
| TopBar with search | ✅ | Task 4 |
| Notification bell with badge | ✅ | Task 4 |
| Command Palette (Cmd+K) | ✅ | Task 3 |
| Mobile bottom nav (<768px) | ✅ | Task 5 |
| AppShell composition | ✅ | Task 6 |
| Dashboard layout server-side auth guard | ✅ | Task 7 |
| KPI metric cards (4-column grid) | ✅ | Task 8 |
| Realtime notification hook wired globally | ✅ | Task 6 (AppShell calls useNotifications) |

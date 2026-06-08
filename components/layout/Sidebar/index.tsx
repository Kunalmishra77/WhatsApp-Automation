'use client';

import Link from 'next/link';
import {
  MessageSquare, Users, Kanban, Megaphone, FileText,
  BarChart3, Settings, UserCircle, ChevronLeft, ChevronRight,
  Users2, GitBranch, BookOpen, TrendingUp,
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
import { hasFeature } from '@/lib/plan-features';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const NAV_ITEMS: Array<{
  href:             string;
  icon:             LucideIcon;
  label:            string;
  requiredFeature?: string;
  requiredPlan?:    string;
}> = [
  { href: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { href: '/contacts',      icon: Users,         label: 'Contacts'      },
  { href: '/crm',           icon: Kanban,        label: 'CRM Pipeline', requiredFeature: 'crm',   requiredPlan: 'Pro' },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns'     },
  { href: '/templates',     icon: FileText,      label: 'Templates'     },
  { href: '/flows',         icon: GitBranch,     label: 'Flows',        requiredFeature: 'flows', requiredPlan: 'Pro' },
  { href: '/team',          icon: Users2,        label: 'Team'          },
  { href: '/analytics',     icon: BarChart3,     label: 'Analytics'     },
  { href: '/ai-revenue',    icon: TrendingUp,    label: 'AI Revenue'    },
  { href: '/knowledge-base',icon: BookOpen,      label: 'Knowledge Base'},
];

export function Sidebar() {
  const collapsed      = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar  = useUIStore((s) => s.toggleSidebar);
  const user           = useAuthStore((s) => s.user);
  const workspace      = useWorkspaceStore((s) => s.activeWorkspace);
  const plan           = workspace?.plan ?? 'free';

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase()
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
          {NAV_ITEMS.map((item) => {
            const locked = item.requiredFeature ? !hasFeature(plan, item.requiredFeature) : false;
            return (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                collapsed={collapsed}
                locked={locked}
                requiredPlan={item.requiredPlan}
              />
            );
          })}
          <Separator className="my-2" />
          <NavItem href="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
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
                  collapsed && 'w-auto justify-center',
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

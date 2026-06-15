'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Users, Kanban, Megaphone, FileText,
  BarChart3, Settings, UserCircle, ChevronLeft, ChevronRight,
  Users2, GitBranch, BookOpen, TrendingUp, LifeBuoy, CalendarCheck, LayoutDashboard,
  LogOut,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavItem } from './NavItem';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { useWorkspaceStore } from '@/store/workspace.store';
import { signOutAction } from '@/app/actions/auth.actions';
import { hasFeature } from '@/lib/plan-features';
import { cn } from '@/lib/utils';
import { SupportModal } from '@/modules/support/components/SupportModal';
import type { LucideIcon } from 'lucide-react';

const NAV_ITEMS: Array<{
  href:             string;
  icon:             LucideIcon;
  label:            string;
  requiredFeature?: string;
  requiredPlan?:    string;
}> = [
  { href: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard'        },
  { href: '/conversations', icon: MessageSquare,   label: 'Conversations'    },
  { href: '/contacts',      icon: Users,           label: 'Contacts'         },
  { href: '/crm',           icon: Kanban,          label: 'CRM Pipeline',    requiredFeature: 'crm',   requiredPlan: 'Pro' },
  { href: '/campaigns',     icon: Megaphone,       label: 'Campaigns'        },
  { href: '/templates',     icon: FileText,        label: 'Templates'        },
  { href: '/flows',         icon: GitBranch,       label: 'Flows',           requiredFeature: 'flows', requiredPlan: 'Pro' },
  { href: '/team',          icon: Users2,          label: 'Team'             },
  { href: '/analytics',     icon: BarChart3,       label: 'Analytics'        },
  { href: '/bookings',      icon: CalendarCheck,   label: 'Bookings & Events'},
  { href: '/ai-revenue',    icon: TrendingUp,      label: 'AI Revenue'       },
  { href: '/knowledge-base',icon: BookOpen,        label: 'Knowledge Base'   },
];

export function Sidebar() {
  const collapsed      = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar  = useUIStore((s) => s.toggleSidebar);
  const user           = useAuthStore((s) => s.user);
  const workspace      = useWorkspaceStore((s) => s.activeWorkspace);
  const plan           = workspace?.plan ?? 'free';
  const [supportOpen, setSupportOpen] = useState(false);

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0] ?? '').join('').slice(0, 2).toUpperCase()
    : '??';

  const planColors: Record<string, string> = {
    free:       'bg-slate-100 text-slate-500',
    pro:        'bg-brand-100 text-brand-600',
    enterprise: 'bg-violet-100 text-violet-600',
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'relative flex h-full flex-col border-r border-border bg-[hsl(220,14%,97%)] transition-all duration-200',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* ── Logo / Workspace ──────────────────────────────────────────── */}
        <div className={cn(
          'flex h-14 shrink-0 items-center border-b border-border px-3',
          collapsed && 'justify-center px-2',
        )}>
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            {/* Brand mark */}
            <div className={cn(
              'flex shrink-0 items-center justify-center rounded-xl font-bold text-white',
              'bg-gradient-to-br from-brand-500 to-indigo-600',
              'shadow-md shadow-brand-500/30',
              collapsed ? 'h-8 w-8 text-sm' : 'h-8 w-8 text-sm',
            )}>
              A
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-none text-foreground">
                  {workspace?.name ?? 'Agentix'}
                </p>
                <span className={cn(
                  'mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize leading-none',
                  planColors[plan] ?? planColors.free,
                )}>
                  {plan}
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* ── Navigation ────────────────────────────────────────────────── */}
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

          {/* Divider */}
          <div className="mx-2 my-2 h-px bg-border" />

          <NavItem href="/settings" icon={Settings} label="Settings" collapsed={collapsed} />

          <button
            onClick={() => setSupportOpen(true)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-150',
              'text-muted-foreground hover:bg-black/[0.04] hover:text-foreground',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? 'Contact Support' : undefined}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg group-hover:bg-black/[0.05]">
              <LifeBuoy className="h-4 w-4" />
            </div>
            {!collapsed && 'Contact Support'}
          </button>
        </nav>

        {/* ── User section ──────────────────────────────────────────────── */}
        <div className={cn(
          'shrink-0 border-t border-border p-2',
          collapsed && 'flex justify-center',
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all hover:bg-black/[0.04]',
                  collapsed && 'w-auto justify-center px-2',
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 ring-2 ring-border ring-offset-1 ring-offset-transparent">
                  <AvatarImage src={user?.avatar_url ?? undefined} alt={user?.full_name ?? ''} />
                  <AvatarFallback className="bg-gradient-to-br from-brand-400 to-indigo-500 text-white text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-none text-foreground">
                      {user?.full_name ?? 'User'}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground mt-0.5">{user?.email ?? ''}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuItem asChild>
                <Link href="/settings/profile" className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4" /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive flex items-center gap-2"
                onSelect={() => { void signOutAction(); }}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {supportOpen && <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className={cn(
            'absolute -right-3.5 top-16 z-10 flex h-7 w-7 items-center justify-center',
            'rounded-full border border-border bg-card shadow-sm',
            'hover:bg-accent transition-colors',
          )}
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronLeft  className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}

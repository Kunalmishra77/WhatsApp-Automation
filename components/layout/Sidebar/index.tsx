'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Users, Kanban, Megaphone, FileText,
  BarChart3, Settings, UserCircle, ChevronLeft, ChevronRight,
  Users2, GitBranch, BookOpen, TrendingUp, LifeBuoy, CalendarCheck,
  LayoutDashboard, LogOut, Brain,
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

const PLAN_BADGE: Record<string, { cls: string; label: string }> = {
  free:        { cls: 'bg-white/10 text-white/50',      label: 'Free'       },
  pro:         { cls: 'bg-brand-500/30 text-brand-300', label: 'Pro'        },
  enterprise:  { cls: 'bg-amber-500/30 text-amber-300', label: 'Enterprise' },
};

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

  const planBadge = PLAN_BADGE[plan] ?? PLAN_BADGE.free!;

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'relative flex h-full flex-col border-r border-white/[0.07] bg-navy-900 transition-all duration-200',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* ── Brand mark ────────────────────────────────────────────────── */}
        <div className={cn(
          'flex h-14 shrink-0 items-center border-b border-white/[0.07] px-3',
          collapsed && 'justify-center px-2',
        )}>
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            {/* Brain logo mark */}
            <div className={cn(
              'flex shrink-0 items-center justify-center rounded-xl',
              'bg-gradient-to-br from-brand-500 to-brand-600',
              'shadow-lg shadow-brand-900/40',
              'h-8 w-8',
            )}>
              <Brain className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                {/* AGENTiX wordmark */}
                <p className="text-sm font-bold leading-none tracking-wide text-white">
                  <span className="text-brand-400">A</span>GENT
                  <span className="text-white/80">i</span>
                  <span className="text-brand-400">X</span>
                </p>
                <span className={cn(
                  'mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider leading-none',
                  planBadge.cls,
                )}>
                  {planBadge.label}
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* ── Workspace name strip ──────────────────────────────────────── */}
        {!collapsed && workspace?.name && (
          <div className="px-3 pt-3 pb-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-widest text-white/30">
              {workspace.name}
            </p>
          </div>
        )}

        {/* ── Navigation ────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
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
          <div className="mx-2 my-2 h-px bg-white/[0.07]" />

          <NavItem href="/settings" icon={Settings} label="Settings" collapsed={collapsed} />

          <button
            onClick={() => setSupportOpen(true)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-150',
              'text-white/50 hover:bg-white/[0.07] hover:text-white/90',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? 'Contact Support' : undefined}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg group-hover:bg-white/[0.08]">
              <LifeBuoy className="h-4 w-4" />
            </div>
            {!collapsed && 'Contact Support'}
          </button>
        </nav>

        {/* ── User section ──────────────────────────────────────────────── */}
        <div className={cn(
          'shrink-0 border-t border-white/[0.07] p-2',
          collapsed && 'flex justify-center',
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all hover:bg-white/[0.07]',
                  collapsed && 'w-auto justify-center px-2',
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white/10">
                  <AvatarImage src={user?.avatar_url ?? undefined} alt={user?.full_name ?? ''} />
                  <AvatarFallback className="bg-gradient-to-br from-brand-500 to-brand-600 text-white text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-none text-white/90">
                      {user?.full_name ?? 'User'}
                    </p>
                    <p className="truncate text-[11px] text-white/40 mt-0.5">{user?.email ?? ''}</p>
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
            'rounded-full border border-border bg-card shadow-md',
            'hover:bg-muted transition-colors',
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

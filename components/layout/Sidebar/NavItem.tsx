'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItemProps {
  href:          string;
  icon:          LucideIcon;
  label:         string;
  collapsed:     boolean;
  badge?:        number;
  locked?:       boolean;
  requiredPlan?: string;
}

export function NavItem({ href, icon: Icon, label, collapsed, badge, locked, requiredPlan }: NavItemProps) {
  const pathname = usePathname();
  const isActive = !locked && (pathname === href || (href !== '/' && pathname.startsWith(href)));

  // Locked state — render a non-clickable div
  if (locked) {
    const lockedContent = (
      <div
        className={cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
          'text-muted-foreground/50 cursor-not-allowed select-none',
          collapsed && 'justify-center px-2',
        )}
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground/40" />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {!collapsed && <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground/40" />}
      </div>
    );

    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span>{lockedContent}</span>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {collapsed ? (
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              {label} — {requiredPlan ?? 'Pro'} plan
            </span>
          ) : (
            `Available on ${requiredPlan ?? 'Pro'} plan`
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

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
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-500" />
      )}

      <Icon
        className={cn(
          'h-5 w-5 shrink-0 transition-colors',
          isActive ? 'text-brand-500' : 'text-muted-foreground group-hover:text-foreground',
        )}
      />

      {!collapsed && <span className="flex-1 truncate">{label}</span>}

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

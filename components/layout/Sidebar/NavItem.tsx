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

  /* ── Locked ──────────────────────────────────────────────────────────────── */
  if (locked) {
    const lockedContent = (
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm',
          'text-white/20 cursor-not-allowed select-none',
          collapsed && 'justify-center px-2',
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4 text-white/15" />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{label}</span>
            <Lock className="ml-auto h-3 w-3 text-white/15" />
          </>
        )}
      </div>
    );

    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild><span>{lockedContent}</span></TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {collapsed
            ? <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" />{label} — {requiredPlan ?? 'Pro'} plan</span>
            : `Available on ${requiredPlan ?? 'Pro'} plan`}
        </TooltipContent>
      </Tooltip>
    );
  }

  /* ── Active / Inactive ───────────────────────────────────────────────────── */
  const content = (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-white/[0.12] text-white'
          : 'text-white/50 hover:bg-white/[0.07] hover:text-white/90',
        collapsed && 'justify-center px-2',
      )}
    >
      {/* Icon square */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
          isActive
            ? 'bg-brand-500 shadow-sm shadow-black/30'
            : 'group-hover:bg-white/[0.08]',
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70',
          )}
        />
      </div>

      {!collapsed && <span className="flex-1 truncate">{label}</span>}

      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
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

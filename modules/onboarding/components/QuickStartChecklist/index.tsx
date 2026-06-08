'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, MessageSquare, Users, Megaphone, Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChecklistState {
  whatsapp_connected: boolean;
  has_contacts: boolean;
  has_campaigns: boolean;
  has_automations: boolean;
}

interface Item {
  key: keyof ChecklistState;
  icon: React.ElementType;
  label: string;
  description: string;
  href: string;
  cta: string;
}

const ITEMS: Item[] = [
  {
    key:         'whatsapp_connected',
    icon:        MessageSquare,
    label:       'Connect WhatsApp',
    description: 'Link your WhatsApp Business API credentials.',
    href:        '/settings?tab=whatsapp',
    cta:         'Go to Settings',
  },
  {
    key:         'has_contacts',
    icon:        Users,
    label:       'Add your first contact',
    description: 'Import contacts or add them manually.',
    href:        '/contacts',
    cta:         'Add Contacts',
  },
  {
    key:         'has_campaigns',
    icon:        Megaphone,
    label:       'Send your first broadcast',
    description: 'Create a campaign and reach your audience.',
    href:        '/campaigns',
    cta:         'Create Campaign',
  },
  {
    key:         'has_automations',
    icon:        Zap,
    label:       'Set up an automation',
    description: 'Auto-reply, follow-ups, or drip sequences.',
    href:        '/flows',
    cta:         'Create Automation',
  },
];

interface Props {
  workspaceId: string;
}

export function QuickStartChecklist({ workspaceId }: Props) {
  const [state, setState] = useState<ChecklistState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = `qs-dismissed-${workspaceId}`;
    if (typeof window !== 'undefined' && localStorage.getItem(key) === '1') {
      setDismissed(true);
      return;
    }
    fetch(`/api/onboarding/checklist?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data: ChecklistState) => setState(data))
      .catch(() => {});
  }, [workspaceId]);

  function dismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`qs-dismissed-${workspaceId}`, '1');
    }
    setDismissed(true);
  }

  if (dismissed || !state) return null;

  const done = ITEMS.filter((i) => state[i.key]).length;
  const total = ITEMS.length;
  const allDone = done === total;

  if (allDone) return null;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Quick Start</p>
          <p className="text-xs text-muted-foreground mt-0.5">{done}/{total} steps complete</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={dismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-1 bg-brand-500 transition-all duration-500"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      {/* Items */}
      <ul className="divide-y divide-border">
        {ITEMS.map((item) => {
          const completed = state[item.key];
          return (
            <li key={item.key} className={cn('flex items-start gap-3 px-5 py-3.5', completed && 'opacity-50')}>
              {completed
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', completed ? 'line-through text-muted-foreground' : 'text-foreground')}>
                  {item.label}
                </p>
                {!completed && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
              {!completed && (
                <Link href={item.href}>
                  <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs">
                    {item.cta}
                  </Button>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

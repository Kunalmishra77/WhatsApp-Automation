'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FaqItem {
  q: string;
  a: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
  className?: string;
}

/**
 * Accessible accordion — one panel open at a time. Each trigger is a real <button> with
 * aria-expanded/aria-controls wired to its panel; panels are hidden (not unmounted) when
 * closed so nothing here relies on JS to be readable, and the whole thing is keyboard
 * operable via native Tab/Enter/Space (no roving-tabindex needed for a single-column list).
 */
export function FaqAccordion({ items, className }: FaqAccordionProps) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className={cn('divide-y divide-navy-900/10 rounded-2xl border border-navy-900/10 bg-white', className)}>
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        const triggerId = `${baseId}-trigger-${i}`;
        const panelId = `${baseId}-panel-${i}`;

        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:px-6"
              >
                <span className="text-sm font-semibold text-navy-900 sm:text-base">{item.q}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-navy-900/40 transition-transform duration-200',
                    isOpen && 'rotate-180 text-brand-500'
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
              className="px-5 pb-5 text-sm leading-relaxed text-navy-900/60 sm:px-6"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}

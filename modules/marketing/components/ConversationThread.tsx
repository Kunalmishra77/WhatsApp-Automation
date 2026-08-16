'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConversationTurn {
  from: 'customer' | 'agent';
  text: string;
}

interface ConversationThreadProps {
  /** The scripted WhatsApp-style exchange, in order. */
  turns: ConversationTurn[];
  /** Optional pipeline chips (e.g. ["Lead", "Hot", "Booked"]) that light up as turns complete. */
  pipeline?: string[];
  /** Smaller phone frame for use alongside 2-3 threads in a row. */
  compact?: boolean;
  className?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/**
 * THE signature element: a rendered (not screenshotted) WhatsApp-style thread.
 *
 * Progressive enhancement, by design: every turn is in the DOM and fully visible from the
 * very first render — no JS, a slow connection, or a full-page/static capture will ever see
 * an empty thread. IntersectionObserver is used ONLY to trigger a one-time staggered
 * fade/rise flourish (and light up the pipeline chips) once the thread scrolls into view in
 * a live browser; it never gates whether the conversation content exists. Static (no
 * animation) under prefers-reduced-motion.
 */
export function ConversationThread({ turns, pipeline, compact = false, className }: ConversationThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [played, setPlayed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPlayed(true);
          observer.disconnect();
        }
      },
      // Fire a little before the frame is fully in view.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const animate = !reducedMotion;
  const litSteps = pipeline ? (reducedMotion || played ? pipeline.length : 0) : 0;

  return (
    <div className={cn('w-full', className)}>
      <div
        ref={containerRef}
        className={cn(
          'mx-auto flex flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-navy-900 shadow-2xl shadow-black/30',
          compact ? 'max-w-xs' : 'max-w-sm'
        )}
      >
        {/* phone-ish header bar */}
        <div className="flex items-center gap-3 bg-navy-900 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
            AI
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">AGENTiX Assistant</p>
            <p className="text-[11px] text-white/45">online</p>
          </div>
        </div>

        {/* messages — always rendered; the reveal animation is a non-gating enhancement */}
        <div
          className={cn(
            'flex flex-col justify-end gap-2 bg-[#efeae2] px-4 py-5',
            compact ? 'min-h-[190px]' : 'min-h-[280px]'
          )}
        >
          {turns.map((turn, i) => (
            <ChatBubble key={i} turn={turn} animate={animate} play={played} index={i} />
          ))}
        </div>
      </div>

      {pipeline && pipeline.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {pipeline.map((step, i) => {
            const lit = i < litSteps;
            return (
              <div key={step} className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-500',
                    lit
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-white/15 bg-transparent text-white/40'
                  )}
                >
                  {step}
                </span>
                {i < pipeline.length - 1 && (
                  <span className={cn('h-px w-4 transition-colors duration-500', lit ? 'bg-brand-500' : 'bg-white/15')} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatBubble({
  turn,
  animate,
  play,
  index,
}: {
  turn: ConversationTurn;
  animate: boolean;
  play: boolean;
  index: number;
}) {
  const isAgent = turn.from === 'agent';
  return (
    <div className={cn('flex', isAgent ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug shadow-sm',
          isAgent ? 'rounded-tr-sm bg-[#dcf8c6] text-navy-900' : 'rounded-tl-sm bg-white text-navy-900',
          // The bubble is already fully visible by default (opacity/position are never
          // gated). "animate-bubble-in" only replays a short fade/rise flourish once the
          // thread has been observed scrolling into view — content, not visibility, is
          // what's guaranteed here.
          animate && play && 'animate-bubble-in'
        )}
        style={animate && play ? { animationDelay: `${index * 90}ms` } : undefined}
      >
        <p>{turn.text}</p>
        {isAgent && (
          <span className="mt-1 flex justify-end">
            <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}

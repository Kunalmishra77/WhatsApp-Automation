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
 * THE signature element: a rendered (not screenshotted) WhatsApp-style thread that reveals
 * turn-by-turn on scroll, with a typing indicator before agent replies and an optional
 * pipeline chip row that lights up as the conversation progresses. Fully static (all turns
 * visible immediately, no typing indicator, no motion) under prefers-reduced-motion.
 */
export function ConversationThread({ turns, pipeline, compact = false, className }: ConversationThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // Reveal the frame once it's ~30% into the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reduced motion: show everything immediately, no stagger, no typing indicator.
  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount(turns.length);
      setIsTyping(false);
    }
  }, [reducedMotion, turns.length]);

  // Staggered reveal, one turn at a time, with a brief "typing…" beat before agent turns.
  useEffect(() => {
    if (reducedMotion || !inView || visibleCount >= turns.length) return;

    const nextTurn = turns[visibleCount];
    if (!nextTurn) return;
    if (nextTurn.from === 'agent' && !isTyping) {
      const typingTimer = setTimeout(() => setIsTyping(true), 350);
      return () => clearTimeout(typingTimer);
    }

    const delay = nextTurn.from === 'agent' ? (isTyping ? 900 : 0) : 650;
    const revealTimer = setTimeout(() => {
      setIsTyping(false);
      setVisibleCount((count) => count + 1);
    }, delay);
    return () => clearTimeout(revealTimer);
  }, [inView, visibleCount, turns, reducedMotion, isTyping]);

  const litPipelineSteps = pipeline
    ? reducedMotion
      ? pipeline.length
      : Math.min(pipeline.length, Math.round((visibleCount / turns.length) * pipeline.length))
    : 0;

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

        {/* messages */}
        <div
          className={cn(
            'flex flex-col justify-end gap-2 bg-[#efeae2] px-4 py-5',
            compact ? 'min-h-[190px]' : 'min-h-[280px]'
          )}
        >
          {turns.map((turn, i) => {
            const isVisible = reducedMotion || i < visibleCount;
            if (!isVisible) return null;
            return <ChatBubble key={i} turn={turn} animate={!reducedMotion} />;
          })}
          {isTyping && !reducedMotion && <TypingBubble />}
        </div>
      </div>

      {pipeline && pipeline.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {pipeline.map((step, i) => {
            const lit = i < litPipelineSteps;
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

function ChatBubble({ turn, animate }: { turn: ConversationTurn; animate: boolean }) {
  const isAgent = turn.from === 'agent';
  return (
    <div className={cn('flex', isAgent ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug shadow-sm',
          isAgent ? 'rounded-tr-sm bg-[#dcf8c6] text-navy-900' : 'rounded-tl-sm bg-white text-navy-900',
          animate && 'animate-bubble-in'
        )}
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

function TypingBubble() {
  return (
    <div className="flex justify-end animate-bubble-in">
      <div className="flex items-center gap-1 rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3.5 py-2.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-900/40 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-900/40 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-900/40" />
      </div>
    </div>
  );
}

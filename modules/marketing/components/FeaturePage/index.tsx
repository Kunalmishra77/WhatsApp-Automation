import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { StatBadge } from '@/modules/marketing/components/StatBadge';
import { CTABand } from '@/modules/marketing/components/CTABand';
import { ConversationThread, type ConversationTurn } from '@/modules/marketing/components/ConversationThread';

export interface FeaturePageSection {
  heading: string;
  body: string;
  bullets?: string[];
  conversation?: ConversationTurn[];
  pipeline?: string[];
}

export interface FeaturePageProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Optional — when omitted, the hero falls back to a stat-focused layout using `stats`. */
  heroConversation?: ConversationTurn[];
  heroPipeline?: string[];
  sections: FeaturePageSection[];
  stats?: { value: string; label: string }[];
}

/**
 * Shared template for the /features deep-dive pages. Composes only the Wave-1 primitives
 * (Section, Eyebrow, DisplayHeading, StatBadge, CTABand, ConversationThread) — no restyling,
 * no forking. Every deep-dive page just supplies content.
 */
export function FeaturePage({
  eyebrow,
  title,
  subtitle,
  heroConversation,
  heroPipeline,
  sections,
  stats,
}: FeaturePageProps) {
  return (
    <>
      {/* ── Hero — a proving thread when supplied, otherwise a stat-focused layout ──── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div
          className={cn(
            'relative items-center gap-16',
            heroConversation && heroConversation.length > 0 ? 'grid lg:grid-cols-2' : 'mx-auto max-w-2xl text-center'
          )}
        >
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <DisplayHeading as="h1" className={cn('text-white', !heroConversation && 'mx-auto')}>
              {title}
            </DisplayHeading>
            <p
              className={cn(
                'mt-6 text-lg leading-relaxed text-white/70',
                heroConversation ? 'max-w-lg' : 'mx-auto max-w-2xl'
              )}
            >
              {subtitle}
            </p>
            <div
              className={cn(
                'mt-9 flex flex-col gap-3 sm:flex-row sm:items-center',
                !heroConversation && 'sm:justify-center'
              )}
            >
              <Button
                asChild
                size="lg"
                className="bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-offset-navy-900"
              >
                <Link href="/signup">
                  Get Started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            {!heroConversation && stats && stats.length > 0 && (
              <div className="mt-12 flex flex-wrap justify-center gap-x-10 gap-y-6 border-t border-white/10 pt-8">
                {stats.map((stat) => (
                  <StatBadge key={stat.label} tone="light" value={stat.value} label={stat.label} />
                ))}
              </div>
            )}
          </div>

          {heroConversation && heroConversation.length > 0 && (
            <ConversationThread className="lg:justify-self-end" turns={heroConversation} pipeline={heroPipeline} />
          )}
        </div>
      </Section>

      {/* ── Body sections — alternate warm/navy, text paired with a proving thread ──── */}
      {sections.map((section, i) => {
        const variant = i % 2 === 0 ? 'warm' : 'navy';
        const isNavy = variant === 'navy';
        const reverse = i % 2 === 1;

        return (
          <Section key={section.heading} variant={variant}>
            <div
              className={cn(
                'grid items-center gap-12',
                section.conversation && 'lg:grid-cols-2 lg:gap-16'
              )}
            >
              <div className={cn(section.conversation && reverse && 'lg:order-2')}>
                <DisplayHeading as="h2" className={isNavy ? 'text-white' : undefined}>
                  {section.heading}
                </DisplayHeading>
                <p
                  className={cn(
                    'mt-4 max-w-xl text-base leading-relaxed',
                    isNavy ? 'text-white/70' : 'text-navy-900/60'
                  )}
                >
                  {section.body}
                </p>
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-6 space-y-3">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className={cn(
                          'flex items-start gap-2.5 text-sm leading-relaxed',
                          isNavy ? 'text-white/80' : 'text-navy-900/70'
                        )}
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {section.conversation && section.conversation.length > 0 && (
                <div className={cn(reverse && 'lg:order-1')}>
                  <ConversationThread turns={section.conversation} pipeline={section.pipeline} />
                </div>
              )}
            </div>
          </Section>
        );
      })}

      {/* ── Stat row — skipped when the hero already used `stats` (no hero conversation) ──── */}
      {heroConversation && stats && stats.length > 0 && (
        <Section variant="white" className="py-14 sm:py-16">
          <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-8">
            {stats.map((stat) => (
              <StatBadge key={stat.label} value={stat.value} label={stat.label} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <Section variant="warm">
        <CTABand />
      </Section>
    </>
  );
}

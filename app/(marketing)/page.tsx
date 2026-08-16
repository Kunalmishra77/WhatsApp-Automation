import Link from 'next/link';
import { ArrowRight, Bot, Inbox, IndianRupee, KanbanSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { StatBadge } from '@/modules/marketing/components/StatBadge';
import { CTABand } from '@/modules/marketing/components/CTABand';
import { ConversationThread, type ConversationTurn } from '@/modules/marketing/components/ConversationThread';

const CLIENTS = ['Umang Hospital', 'Razorveda', 'Fitness First', 'Skinwise', 'VMS'];

const DIFFERENTIATORS = [
  {
    icon: Bot,
    title: 'Live AI agent, bundled',
    description:
      'A real AI agent answers WhatsApp and Instagram the moment a message lands — not a paid add-on you bolt on later. It ships included, from day one.',
  },
  {
    icon: Inbox,
    title: 'WhatsApp + Instagram, one inbox',
    description:
      'Stop juggling apps and tabs. Every DM, comment reply, and story mention lands in a single shared inbox your whole team already knows how to use.',
  },
  {
    icon: KanbanSquare,
    title: 'Kanban CRM with lead temperature',
    description:
      'Every conversation is automatically scored Hot, Warm, or Cold — so your team always knows exactly who to call back first.',
  },
  {
    icon: IndianRupee,
    title: 'Transparent flat INR pricing',
    description:
      '₹2,999 per month, GST included. No hidden Meta conversation markup, no per-agent surprises buried in the invoice.',
  },
];

const HOW_IT_WORKS: {
  step: string;
  title: string;
  description: string;
  turns: ConversationTurn[];
  pipeline?: string[];
}[] = [
  {
    step: '01',
    title: 'Automate',
    description: 'The AI agent answers routine questions instantly, day or night — no one waits on hold.',
    turns: [
      { from: 'customer', text: 'What are your clinic timings?' },
      {
        from: 'agent',
        text: "We're open Mon–Sat, 9 AM–8 PM. Booking a slot skips the walk-in wait — want me to check availability?",
      },
    ],
  },
  {
    step: '02',
    title: 'Convert',
    description: 'The moment intent shows up, the CRM scores the lead and hands your team a warm conversation.',
    turns: [
      {
        from: 'customer',
        text: "I'm looking for a dermatologist for acne, need it sorted this week, budget isn't an issue.",
      },
      {
        from: 'agent',
        text: "Got it — I'm marking you as a priority lead. Our specialist has an opening this Thursday. Shall I hold it?",
      },
    ],
    pipeline: ['Lead', 'Hot'],
  },
  {
    step: '03',
    title: 'Grow',
    description: 'Campaigns reopen old conversations — and the same AI agent closes the reply.',
    turns: [
      { from: 'customer', text: 'Saw your Diwali offer — is it still on?' },
      { from: 'agent', text: 'Yes! 20% off every package till Sunday. Want me to apply it to your booking?' },
    ],
  },
];

export const metadata = {
  title: 'AI Agent for WhatsApp + Instagram',
  description:
    'AGENTiX bundles a live AI agent for WhatsApp and Instagram with one shared inbox, a hot/warm/cold CRM, and flat ₹2,999/mo pricing — no hidden Meta markup.',
};

export default function MarketingHomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* -mt-16 pulls the hero up under the sticky h-16 nav so the nav's transparent
          state genuinely sits over the navy background (not the layout's warm bg) —
          pt-16 keeps the visible content clear of the nav bar. */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative grid items-center gap-16 lg:grid-cols-2">
          <div>
            <Eyebrow>Live AI agent for WhatsApp + Instagram</Eyebrow>
            <DisplayHeading as="h1" className="text-white">
              Every customer, answered in seconds.
            </DisplayHeading>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">
              AGENTiX bundles a real AI agent that answers, qualifies, and books on WhatsApp and Instagram —
              while every conversation lands in one inbox with a CRM that already knows who&apos;s hot.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-offset-navy-900">
                <Link href="/signup">
                  Get Started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white focus-visible:ring-offset-navy-900"
              >
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-10 gap-y-6 border-t border-white/10 pt-8">
              <StatBadge tone="light" value="₹2,999" label="Flat, per month" />
              <StatBadge tone="light" value="2" label="Channels, one inbox" />
              <StatBadge tone="light" value="Bundled" label="AI agent included" />
            </div>
          </div>

          <ConversationThread
            className="lg:justify-self-end"
            pipeline={['Lead', 'Hot', 'Booked']}
            turns={[
              { from: 'customer', text: 'Do you have an appointment tomorrow?' },
              {
                from: 'agent',
                text: 'Yes! I have a 4:30 PM slot open tomorrow. Want me to book it for you?',
              },
              { from: 'customer', text: 'Yes please, book it.' },
              { from: 'agent', text: "Done! You're confirmed for tomorrow, 4:30 PM. See you then." },
            ]}
          />
        </div>
      </Section>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <Section variant="white" className="py-12 sm:py-14">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-navy-900/40">
          Trusted by growing Indian businesses
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {CLIENTS.map((client) => (
            <span
              key={client}
              className="rounded-full border border-navy-900/10 bg-navy-50 px-4 py-2 text-sm font-medium text-navy-900/70"
            >
              {client}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Differentiators ──────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Why AGENTiX</Eyebrow>
          <DisplayHeading>Built for how Indian businesses actually sell.</DisplayHeading>
          <p className="mt-4 text-base leading-relaxed text-navy-900/60">
            Most WhatsApp tools sell you plumbing. AGENTiX sells you a working front desk — one that never
            sleeps, never forgets a follow-up, and never adds a line item you didn&apos;t expect.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {DIFFERENTIATORS.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </div>
      </Section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <Section variant="navy" id="how-it-works">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>How it works</Eyebrow>
          <DisplayHeading className="text-white">One agent, the whole customer journey.</DisplayHeading>
          <p className="mt-4 text-base leading-relaxed text-white/60">
            The same AI agent that answers a question also qualifies the lead and closes the follow-up —
            proven below, turn by turn.
          </p>
        </div>
        <div className="mt-16 grid gap-12 lg:grid-cols-3 lg:gap-8">
          {HOW_IT_WORKS.map((block) => (
            <div key={block.step} className="flex flex-col items-center text-center">
              <span className="font-display text-sm font-semibold text-brand-500">{block.step}</span>
              <h3 className="mt-2 font-display text-xl font-semibold text-white">{block.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/60">{block.description}</p>
              <div className="mt-6 w-full">
                <ConversationThread compact turns={block.turns} pipeline={block.pipeline} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Pricing teaser ───────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="mx-auto max-w-lg text-center">
          <Eyebrow>Pricing</Eyebrow>
          <DisplayHeading>One flat price. Nothing hidden.</DisplayHeading>
          <p className="mt-4 text-base leading-relaxed text-navy-900/60">
            No per-agent seats, no surprise Meta markup on conversations. Add Instagram whenever you&apos;re
            ready.
          </p>
        </div>
        <div className="mx-auto mt-12 max-w-md rounded-3xl border border-navy-900/10 bg-white p-8 shadow-lg shadow-navy-900/5 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">WhatsApp Growth</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-5xl font-bold text-navy-900">₹2,999</span>
            <span className="text-sm font-medium text-navy-900/50">/ month</span>
          </div>
          <p className="mt-2 text-sm text-navy-900/50">GST included · Instagram add-on available</p>
          <ul className="mt-7 space-y-3 text-sm text-navy-900/70">
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Live AI agent, included — not an add-on
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Shared inbox across WhatsApp + Instagram
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Kanban CRM with lead temperature
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Campaigns, broadcasts &amp; templates
            </li>
          </ul>
          <Button asChild size="lg" className="mt-8 w-full bg-brand-500 text-white hover:bg-brand-600">
            <Link href="/signup">Get Started</Link>
          </Button>
          <Link
            href="/pricing"
            className="mt-4 block text-center text-sm font-medium text-navy-900/60 hover:text-navy-900"
          >
            See full pricing &amp; comparison →
          </Link>
        </div>
      </Section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <CTABand />
      </Section>
    </>
  );
}

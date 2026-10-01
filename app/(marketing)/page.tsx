import Link from 'next/link';
import { ArrowRight, Bot, Inbox, IndianRupee, KanbanSquare, MessageCircle, Camera, MapPin, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { StatBadge } from '@/modules/marketing/components/StatBadge';
import { CTABand } from '@/modules/marketing/components/CTABand';
import { ConversationThread, type ConversationTurn } from '@/modules/marketing/components/ConversationThread';
import { FaqAccordion } from '@/modules/marketing/components/FaqAccordion';
import { cn } from '@/lib/utils';

const CLIENTS = ['Umang Hospital', 'Razorveda', 'Fitness First', 'Skinwise', 'VMS'];

const BUILT_ON = ['Meta WhatsApp Business API', 'Instagram Graph API', 'Google Business & Ads', 'Razorpay', 'OpenAI'];

const INDUSTRIES = [
  { emoji: '🏥', name: 'Clinics & Hospitals' },
  { emoji: '💇', name: 'Salons & Spas' },
  { emoji: '🏋️', name: 'Gyms & Fitness' },
  { emoji: '🍽️', name: 'Restaurants & Cafés' },
  { emoji: '🏠', name: 'Real Estate' },
  { emoji: '🛍️', name: 'Retail & D2C' },
  { emoji: '🎓', name: 'Education & Coaching' },
  { emoji: '🏨', name: 'Hotels & Travel' },
  { emoji: '💊', name: 'Pharma & Wellness' },
  { emoji: '🔧', name: 'Local Services' },
];

const HOME_FAQS = [
  { q: 'Do I need technical skills to set it up?', a: 'No. Sign up, connect your WhatsApp number (and Instagram if you want), and your AI agent is live in minutes — we guide you through every step.' },
  { q: 'Is there a free trial?', a: 'Yes — every account starts with a 3-day free trial of the Core plan. No credit card required.' },
  { q: 'Which channels does it work on?', a: 'WhatsApp and Instagram today, both in one shared inbox. Google Business Profile, Ads and local-rank tools come with the Google Growth add-on.' },
  { q: 'Will the AI stay on-topic for my business?', a: 'Yes. The agent only talks about your business, products and services — it politely declines anything off-topic, and answers from your own knowledge base.' },
  { q: 'How is pricing structured?', a: 'Core (WhatsApp) is ₹2,999/mo. Add Instagram (+₹999) and Google Growth (+₹999), or take everything as All-in-One at ₹4,999/mo. All prices exclude 18% GST.' },
  { q: 'Can I add or remove modules later?', a: 'Anytime — from Settings → Billing. Your plan and invoice update to match immediately.' },
];

const MODULES = [
  {
    name: 'Core',
    icon: MessageCircle,
    iconBg: 'bg-emerald-500',
    price: '₹2,999',
    priceNote: '/mo',
    tagline: 'Everything you need to sell on WhatsApp with a live AI agent.',
    featured: true,
    features: [
      'AI agent answers, qualifies & books 24/7',
      'Shared team inbox + hot/warm/cold CRM',
      'Campaigns, broadcasts & templates',
      'In-chat Razorpay payment links',
    ],
  },
  {
    name: 'Instagram',
    icon: Camera,
    iconBg: 'bg-fuchsia-500',
    price: '+₹999',
    priceNote: '/mo',
    tagline: 'Put the same AI agent to work across your Instagram DMs.',
    featured: false,
    features: [
      'Auto-reply to Instagram DMs',
      'Comment-reply on your posts',
      'Follow-first on new conversations',
      'One inbox for WhatsApp + Instagram',
    ],
  },
  {
    name: 'Google Growth',
    icon: MapPin,
    iconBg: 'bg-blue-500',
    price: '+₹999',
    priceNote: '/mo',
    tagline: 'Get found on Google and turn searches into customers.',
    featured: false,
    features: [
      'Google Business Profile management',
      'Google Ads performance insights',
      'Local rank tracking by keyword',
      'Automated review requests & replies',
    ],
  },
];

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
      '₹2,999 per month, excl. 18% GST. No hidden Meta conversation markup, no per-agent surprises buried in the invoice.',
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
              Your AI closes the deal while you sleep.
            </DisplayHeading>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">
              A real AI agent answers, qualifies and books across WhatsApp and Instagram —
              every conversation in one inbox, with a CRM that already knows who&apos;s hot.
              Watch it work on the right.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-offset-navy-900">
                <Link href="/signup">
                  Start 3-day free trial
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
              <StatBadge tone="light" value="3 days" label="Free trial, no card" />
              <StatBadge tone="light" value="2" label="Channels, one inbox" />
              <StatBadge tone="light" value="Bundled" label="AI agent included" />
            </div>
          </div>

          <ConversationThread
            className="lg:justify-self-end"
            channel="whatsapp"
            headerName="New lead · +91 98•• ••21"
            typing
            pipeline={['Lead', 'Hot', 'Booked']}
            turns={[
              { from: 'customer', text: 'Hi, saw your ad. How much is the treatment?' },
              { from: 'agent', text: 'Hi! 😊 It starts at ₹4,999 and includes a free consultation. Would you like to book a slot this week?' },
              { from: 'customer', text: 'Yes, tomorrow evening works.' },
              { from: 'agent', text: 'Perfect — you’re booked for tomorrow 5:30 PM ✅ I’ve sent a confirmation. See you then!' },
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

        <p className="mt-12 text-center text-xs font-semibold uppercase tracking-[0.2em] text-navy-900/40">
          Built on the platforms you already trust
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {BUILT_ON.map((p) => (
            <span key={p} className="text-sm font-semibold text-navy-900/45">{p}</span>
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

      {/* ── Modules ──────────────────────────────────────────────────────── */}
      <Section variant="white">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>One platform, three products</Eyebrow>
          <DisplayHeading>Start with WhatsApp. Add channels as you grow.</DisplayHeading>
          <p className="mt-4 text-base leading-relaxed text-navy-900/60">
            Core gets you selling on WhatsApp in minutes. Switch on Instagram and Google Growth whenever
            you&apos;re ready — same inbox, same AI, one bill.
          </p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div
              key={m.name}
              className={cn(
                'relative flex flex-col rounded-3xl border bg-white p-7 shadow-sm',
                m.featured ? 'border-brand-300 ring-1 ring-brand-200' : 'border-navy-900/10',
              )}
            >
              {m.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand-500 px-3 py-1 text-[11px] font-semibold text-white">Most popular</span>
              )}
              <div className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', m.iconBg)}>
                <m.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-navy-900">{m.name}</h3>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-bold text-navy-900">{m.price}</span>
                <span className="text-sm text-navy-900/50">{m.priceNote}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-navy-900/60">{m.tagline}</p>
              <ul className="mt-5 space-y-2.5 text-sm text-navy-900/70">
                {m.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-navy-900/55">
          All three together —{' '}
          <span className="font-semibold text-navy-900">All-in-One at ₹4,999/month</span>. Every plan starts with a 3-day free trial.
        </p>
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

      {/* ── Industries ───────────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Built for your business</Eyebrow>
          <DisplayHeading>Loved across every kind of local business.</DisplayHeading>
          <p className="mt-4 text-base leading-relaxed text-navy-900/60">
            The AI agent, templates and flows adapt to your industry — pick your type during setup and
            start with ready-made replies and campaigns.
          </p>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {INDUSTRIES.map((ind) => (
            <span
              key={ind.name}
              className="inline-flex items-center gap-2 rounded-full border border-navy-900/10 bg-white px-4 py-2.5 text-sm font-medium text-navy-900/75 shadow-sm"
            >
              <span aria-hidden="true">{ind.emoji}</span>
              {ind.name}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Free GBP Report (lead magnet) ────────────────────────────────── */}
      <Section variant="white">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-8 shadow-sm sm:p-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700">
                Free tool
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold text-navy-900 sm:text-3xl">
                Free Google Business Profile report
              </h3>
              <p className="mt-3 text-base leading-relaxed text-navy-900/60">
                See exactly how your business shows up on Google — rating, reviews, photos, response rate —
                and the quick wins that get you more calls. No signup, takes 30 seconds.
              </p>
              <Button asChild size="lg" className="mt-6 bg-brand-500 text-white hover:bg-brand-600">
                <Link href="/gbp-report">
                  Get my free report
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <ul className="space-y-3 text-sm text-navy-900/70">
              {['Your Google rating & review count', 'Profile completeness score', 'What competitors are doing better', 'Actionable fixes, prioritised'].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
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
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">Core (WhatsApp)</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-5xl font-bold text-navy-900">₹2,999</span>
            <span className="text-sm font-medium text-navy-900/50">/ month</span>
          </div>
          <p className="mt-2 text-sm text-navy-900/50">Excl. 18% GST · + Instagram ₹999 · + Google Growth ₹999 · All-in-One ₹4,999</p>
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
            <Link href="/signup">Start 3-day free trial</Link>
          </Button>
          <Link
            href="/pricing"
            className="mt-4 block text-center text-sm font-medium text-navy-900/60 hover:text-navy-900"
          >
            See full pricing &amp; comparison →
          </Link>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section variant="white">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Questions</Eyebrow>
          <DisplayHeading>Everything you want to know.</DisplayHeading>
        </div>
        <div className="mx-auto mt-12 max-w-2xl">
          <FaqAccordion items={HOME_FAQS} />
        </div>
      </Section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <CTABand />
      </Section>
    </>
  );
}

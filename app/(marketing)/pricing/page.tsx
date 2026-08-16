import type { Metadata } from 'next';
import { Fragment } from 'react';
import { Bot, IndianRupee, KanbanSquare, MessagesSquare } from 'lucide-react';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { CTABand } from '@/modules/marketing/components/CTABand';
import { PricingTable } from '@/modules/marketing/components/PricingTable';
import { FaqAccordion } from '@/modules/marketing/components/FaqAccordion';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'One flat price for WhatsApp — ₹2,999/month, GST clearly noted, live AI agent bundled in. Add Instagram whenever you’re ready. No hidden Meta markup, no per-agent seats.',
};

const INCLUDED = [
  {
    icon: Bot,
    title: 'Live AI agent, bundled',
    description: 'Answers, qualifies, and books on your behalf — included from day one, not a paid add-on.',
  },
  {
    icon: MessagesSquare,
    title: 'One shared inbox',
    description: 'Every WhatsApp (and Instagram, if added) conversation lands in a single inbox your team already knows.',
  },
  {
    icon: KanbanSquare,
    title: 'Hot / warm / cold CRM',
    description: 'Every conversation is scored automatically, so your team calls back the right lead first.',
  },
  {
    icon: IndianRupee,
    title: 'Flat INR pricing',
    description: 'One number on the invoice. No per-conversation Meta markup, no per-agent seat pricing.',
  },
];

const COMPARISON = [
  {
    title: 'Live AI agent',
    us: 'Bundled in every plan, from your first login.',
    them: 'Usually a separate paid add-on, or missing entirely.',
  },
  {
    title: 'Pricing',
    us: 'One flat monthly number, quoted up front.',
    them: 'Base fee plus per-conversation Meta markup that shows up on the invoice later.',
  },
  {
    title: 'Channels',
    us: 'WhatsApp and Instagram in one inbox, one CRM.',
    them: 'Separate tools or logins for each channel.',
  },
  {
    title: 'Lead qualification',
    us: 'Automatic hot / warm / cold scoring on every conversation.',
    them: 'Manual tagging, if it exists at all.',
  },
];

const FAQS = [
  {
    q: 'Does the ₹2,999 price include GST?',
    a: 'No — ₹2,999/month is the base price, excluding 18% GST. With GST, that’s ₹3,538.82/month. GST is called out clearly at every term on this page.',
  },
  {
    q: 'What do the 6-month and yearly terms save me?',
    a: 'Paying for 6 months upfront brings the WhatsApp plan to ₹15,000 (about 17% off the monthly rate), and yearly brings it to ₹30,000 — both shown with the original price struck through so the saving is obvious.',
  },
  {
    q: 'Is the AI agent really included, or is it an extra cost?',
    a: 'It’s included in every plan and every term. There is no separate "AI add-on" tier — the agent that answers, qualifies, and books is part of the base price.',
  },
  {
    q: 'How much does adding Instagram cost?',
    a: 'Instagram DMs bring the plan to ₹3,998/month (again, excluding GST), with the same discounted rates available on the 6-month and yearly terms. Toggle it on the pricing card above to see the exact numbers.',
  },
  {
    q: 'Are there any hidden fees on top of the plan price?',
    a: 'No. The price shown is the price you pay for the platform. The only pass-through cost outside your AGENTiX subscription is Meta’s own WhatsApp conversation charges, which Meta bills separately and which every WhatsApp Business API provider is subject to.',
  },
  {
    q: 'Can I cancel or change my term later?',
    a: 'Yes — reach out to support@agentix.in and we’ll help you switch terms or cancel. There’s no long-term lock-in beyond the term you’ve already paid for.',
  },
];

export default function PricingPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            One flat price. Nothing hidden.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            No per-agent seats, no surprise Meta markup buried in the invoice. Pick your term, add
            Instagram if you want it, and see exactly what you&apos;ll pay.
          </p>
        </div>
      </Section>

      {/* ── Pricing table ────────────────────────────────────────────────── */}
      <Section variant="warm">
        <PricingTable />
      </Section>

      {/* ── What's included ──────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>What&apos;s included</Eyebrow>
          <DisplayHeading>Every plan, every term, no fine print.</DisplayHeading>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </div>
      </Section>

      {/* ── Comparison ───────────────────────────────────────────────────── */}
      <Section variant="navy">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>How it compares</Eyebrow>
          <DisplayHeading className="text-white">Most WhatsApp tools sell you plumbing.</DisplayHeading>
          <p className="mt-4 text-base leading-relaxed text-white/60">
            AGENTiX is built to be the whole front desk — priced so you know exactly what you&apos;re
            paying before you sign up.
          </p>
        </div>
        <div className="mt-14 overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-3 gap-px bg-white/10 text-sm">
            <div className="bg-navy-900 px-4 py-4 font-semibold text-white/50 sm:px-6">&nbsp;</div>
            <div className="bg-navy-900 px-4 py-4 font-semibold text-brand-500 sm:px-6">AGENTiX</div>
            <div className="bg-navy-900 px-4 py-4 font-semibold text-white/50 sm:px-6">Typical WhatsApp tool</div>
            {COMPARISON.map((row) => (
              <Fragment key={row.title}>
                <div className="bg-navy-900 px-4 py-5 text-white/70 sm:px-6">{row.title}</div>
                <div className="bg-navy-900 px-4 py-5 text-white sm:px-6">{row.us}</div>
                <div className="bg-navy-900 px-4 py-5 text-white/50 sm:px-6">{row.them}</div>
              </Fragment>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Questions</Eyebrow>
          <DisplayHeading>Pricing, answered.</DisplayHeading>
        </div>
        <div className="mx-auto mt-12 max-w-2xl">
          <FaqAccordion items={FAQS} />
        </div>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <CTABand />
      </Section>
    </>
  );
}

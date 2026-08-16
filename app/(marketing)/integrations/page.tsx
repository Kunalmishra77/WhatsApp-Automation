import type { Metadata } from 'next';
import { Camera, CreditCard, MessageCircle, Sheet as SheetIcon, Sparkles } from 'lucide-react';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { CTABand } from '@/modules/marketing/components/CTABand';

export const metadata: Metadata = {
  title: 'Integrations',
  description:
    'AGENTiX connects to the official WhatsApp Business API, Instagram DMs, Razorpay for in-chat payments, and Google Sheets for lead export — with more integrations on the way.',
};

const INTEGRATIONS = [
  {
    icon: MessageCircle,
    name: 'WhatsApp Business API',
    description:
      'Built on Meta’s official WhatsApp Business API — the same channel your customers already use, connected properly, not through a workaround.',
  },
  {
    icon: Camera,
    name: 'Instagram DMs',
    description:
      'Bring Instagram direct messages into the same inbox as WhatsApp, answered by the same AI agent, scored by the same CRM.',
  },
  {
    icon: CreditCard,
    name: 'Razorpay',
    description:
      'Send a payment link inside the conversation and get paid without the customer ever leaving the chat.',
  },
  {
    icon: SheetIcon,
    name: 'Google Sheets',
    description:
      'Export leads and conversation data straight to a Google Sheet — for the team that still lives in a spreadsheet.',
  },
];

export default function IntegrationsPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>Integrations</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            Connects to the tools you already use.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            No middleware to wire up yourself. WhatsApp, Instagram, payments, and lead export —
            connected out of the box.
          </p>
        </div>
      </Section>

      {/* ── Integration grid ─────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="grid gap-6 sm:grid-cols-2">
          {INTEGRATIONS.map((item) => (
            <FeatureCard key={item.name} icon={item.icon} title={item.name} description={item.description} />
          ))}
        </div>

        <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-navy-900/15 bg-white/60 px-6 py-8 text-center">
          <Sparkles className="h-6 w-6 text-brand-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-navy-900">More integrations coming</p>
          <p className="text-sm leading-relaxed text-navy-900/60">
            We&apos;re actively building out the integration list. Have a tool you need connected? Tell
            us at{' '}
            <a href="mailto:support@agentix.in" className="font-medium text-brand-600 hover:underline">
              support@agentix.in
            </a>
            .
          </p>
        </div>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <CTABand />
      </Section>
    </>
  );
}

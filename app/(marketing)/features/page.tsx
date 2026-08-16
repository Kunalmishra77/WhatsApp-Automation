import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BarChart3, Bot, Inbox, KanbanSquare, Megaphone, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { CTABand } from '@/modules/marketing/components/CTABand';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything AGENTiX bundles for WhatsApp + Instagram: AI agent, automation, campaigns, a lead-temperature CRM, a shared team inbox, and analytics — one flat price.',
};

const FEATURES = [
  {
    href: '/features/whatsapp-automation',
    icon: MessageSquare,
    title: 'WhatsApp Automation',
    description:
      'Auto-reply 24/7, share your catalog, take orders with a payment link, and send campaign broadcasts — all inside WhatsApp.',
  },
  {
    href: '/features/ai-agent',
    icon: Bot,
    title: 'AI Agent',
    description:
      'A real conversational AI, bundled — grounded in your own knowledge base, fluent in Hindi and Hinglish, and quoting today’s pricing.',
  },
  {
    href: '/features/campaigns',
    icon: Megaphone,
    title: 'Campaigns & Broadcasts',
    description:
      'Template broadcasts to segmented audiences, with delivery/read/reply analytics and one-click retargeting.',
  },
  {
    href: '/features/crm',
    icon: KanbanSquare,
    title: 'CRM with Lead Temperature',
    description: 'A Kanban pipeline where every lead is automatically scored Hot, Warm, or Cold — and qualified by AI.',
  },
  {
    href: '/features/shared-inbox',
    icon: Inbox,
    title: 'Shared Team Inbox',
    description: 'WhatsApp and Instagram DMs in one inbox — agent assignment, internal notes, labels, no juggled phones.',
  },
  {
    href: '/features/analytics',
    icon: BarChart3,
    title: 'Analytics & Reports',
    description: 'One accurate dashboard for conversations, campaigns, leads, and revenue — with CSV export.',
  },
];

export default function FeaturesOverviewPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>Features</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            Everything your front desk needs, in one place.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            One bundled AI agent, one shared inbox, one CRM that already knows who&apos;s hot — six features
            that work together instead of six tools you have to stitch together yourself.
          </p>
          <div className="mt-9 flex justify-center">
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
        </div>
      </Section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Link
              key={feature.href}
              href={feature.href}
              className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-warm"
            >
              <FeatureCard icon={feature.icon} title={feature.title} description={feature.description} />
            </Link>
          ))}
        </div>
      </Section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <CTABand />
      </Section>
    </>
  );
}

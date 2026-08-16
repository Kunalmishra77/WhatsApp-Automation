import type { Metadata } from 'next';
import { Database, KeyRound, Lock, ShieldCheck, UserCheck, Wallet } from 'lucide-react';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { CTABand } from '@/modules/marketing/components/CTABand';

export const metadata: Metadata = {
  title: 'Security & Trust',
  description:
    'How AGENTiX protects your data — per-workspace row-level isolation on Postgres, encrypted credentials, no cross-tenant access, Razorpay for payments, and Meta-compliant messaging.',
};

const TRUST_POINTS = [
  {
    icon: Database,
    title: 'Per-workspace data isolation',
    description:
      'Every business runs in its own workspace, enforced with row-level security at the database level — your conversations, contacts, and CRM data are never queried alongside another workspace\'s.',
  },
  {
    icon: Lock,
    title: 'Encrypted credentials',
    description:
      'API keys and channel credentials (WhatsApp, Instagram, Razorpay) are stored encrypted, not in plain text — used only by the systems that need them to send your messages.',
  },
  {
    icon: ShieldCheck,
    title: 'No cross-tenant access',
    description:
      'Row-level security means one workspace\'s data is structurally unreachable from another — not just hidden by application logic, but enforced by the database itself.',
  },
  {
    icon: Wallet,
    title: 'Secure payments via Razorpay',
    description:
      'In-chat payment links run through Razorpay, a licensed Indian payment gateway — AGENTiX never stores your customers\' card or bank details.',
  },
  {
    icon: UserCheck,
    title: 'Meta-compliant messaging',
    description:
      'Built on the official WhatsApp Business API and Meta\'s Instagram messaging platform, following their messaging and opt-in policies rather than working around them.',
  },
  {
    icon: KeyRound,
    title: 'You own your data',
    description:
      'Your conversations, contacts, and knowledge base belong to you. Export your leads to Google Sheets any time, and reach out to support to close your account and remove your data.',
  },
];

export default function SecurityPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>Security &amp; trust</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            Your customers&apos; conversations, kept yours.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            AGENTiX is built on Supabase/Postgres with row-level security, so every workspace&apos;s
            data stays structurally separate — not just hidden behind a login.
          </p>
        </div>
      </Section>

      {/* ── Trust cards ──────────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_POINTS.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </div>
      </Section>

      {/* ── Honesty note ─────────────────────────────────────────────────── */}
      <Section variant="white" className="py-14 sm:py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-navy-900/10 bg-navy-50/50 p-8 text-center">
          <p className="text-sm leading-relaxed text-navy-900/60">
            We&apos;re a growing platform and we&apos;d rather be precise than impressive: AGENTiX does not
            currently hold formal certifications like SOC 2 or ISO 27001. What we do have is a security
            architecture built on well-established infrastructure — Supabase/Postgres row-level security,
            encrypted credentials, and official Meta and Razorpay integrations — and a team that treats
            your customers&apos; data as if it were our own. Questions about our setup? Email{' '}
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

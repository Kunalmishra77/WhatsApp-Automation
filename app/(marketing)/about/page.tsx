import type { Metadata } from 'next';
import { Compass, Handshake, Sparkles, Target } from 'lucide-react';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { CTABand } from '@/modules/marketing/components/CTABand';

export const metadata: Metadata = {
  title: 'About',
  description:
    'AGENTiX helps Indian SMBs turn every WhatsApp and Instagram conversation into a customer, with a bundled AI agent and honest, flat pricing. AI Applied, Growth Multiplied.',
};

const VALUES = [
  {
    icon: Target,
    title: 'Built for the front desk, not the dev team',
    description:
      'Most WhatsApp tools are plumbing you have to wire up. We build the thing that actually answers your customer — set up in minutes, not a project.',
  },
  {
    icon: Handshake,
    title: 'Honest about what it costs',
    description:
      'One flat number, GST called out clearly, no line items that surprise you three months in. If a feature isn\'t ready, we say so instead of overselling it.',
  },
  {
    icon: Sparkles,
    title: 'AI that does the job, not a demo',
    description:
      'The agent is judged the same way your team is — did it answer correctly, did it qualify the lead, did it help close the sale. Not how clever the tech sounds.',
  },
  {
    icon: Compass,
    title: 'Grounded in Indian business, day to day',
    description:
      'Hospitals, salons, retail, coaching businesses — we build for how they actually run: Hindi/Hinglish conversations, WhatsApp-first customers, and teams that need results, not dashboards.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>About AGENTiX</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            AI Applied, Growth Multiplied.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            We build the AI front desk for Indian businesses — so every WhatsApp and Instagram message
            gets answered, every lead gets qualified, and nothing falls through the cracks.
          </p>
        </div>
      </Section>

      {/* ── Mission ──────────────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>Our mission</Eyebrow>
          <DisplayHeading>Turn every conversation into a customer.</DisplayHeading>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-navy-900/70">
            <p>
              Indian SMBs run on WhatsApp — a clinic&apos;s booking, a salon&apos;s follow-up, a retailer&apos;s
              lead all start with a chat. But most businesses answer that chat manually: a phone changing
              hands, a message missed after hours, a hot lead that goes cold because no one replied in
              time.
            </p>
            <p>
              AGENTiX exists to fix that gap. We bundle a real AI agent — grounded in your business,
              speaking the language your customers actually use — with a shared inbox and a CRM that
              scores every conversation automatically. The result is simple: fewer missed messages, faster
              replies, and a team that knows exactly who to call back first.
            </p>
            <p>
              We&apos;re a growing product, built and supported by a small team that talks to the
              businesses using it. We&apos;d rather ship something honest and useful than something that
              only sounds impressive in a pitch.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Values ───────────────────────────────────────────────────────── */}
      <Section variant="navy">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>What we care about</Eyebrow>
          <DisplayHeading className="text-white">How we build AGENTiX.</DisplayHeading>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {VALUES.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </div>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <CTABand />
      </Section>
    </>
  );
}

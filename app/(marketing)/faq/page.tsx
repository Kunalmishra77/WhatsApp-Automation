import type { Metadata } from 'next';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { CTABand } from '@/modules/marketing/components/CTABand';
import { FaqAccordion } from '@/modules/marketing/components/FaqAccordion';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Common questions about AGENTiX — setup, connecting your WhatsApp number, pricing and GST, AI accuracy, Instagram, data security, cancellation, and onboarding.',
};

const FAQS = [
  {
    q: 'How long does setup take?',
    a: 'Most businesses are live within minutes of signing up — connect your WhatsApp number, upload your knowledge base (services, pricing, FAQs), and the AI agent starts answering. No developer required.',
  },
  {
    q: 'Do I need a new WhatsApp number, or can I use my existing one?',
    a: 'You can connect your existing WhatsApp Business number through the official WhatsApp Business API. If it\'s currently on the regular WhatsApp Business app, we\'ll walk you through migrating it during onboarding.',
  },
  {
    q: 'How much does AGENTiX cost, and does the price include GST?',
    a: 'The WhatsApp plan is ₹2,999/month, excluding 18% GST (₹3,538.82/month with GST). Longer terms (6-month, yearly) come at a discount. See the full breakdown, including the Instagram add-on, on the Pricing page.',
  },
  {
    q: 'How accurate is the AI agent?',
    a: 'The agent answers from your own knowledge base — the services, pricing, and policies you provide — so it stays accurate to your business rather than guessing. It\'s also designed to hand off to a human for complaints, unusual requests, or anything it isn\'t confident about.',
  },
  {
    q: 'Can I use Instagram as well as WhatsApp?',
    a: 'Yes. Adding Instagram brings DMs into the same shared inbox, answered by the same AI agent and scored by the same CRM. It\'s available as an add-on on any term — see Pricing for the exact numbers.',
  },
  {
    q: 'Is my customer data secure?',
    a: 'Each business runs in its own isolated workspace, enforced with row-level security at the database level, and credentials are stored encrypted. See the Security page for the full picture — including what we don\'t claim.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Email support@agentix.in and we\'ll help you cancel or change your term. There\'s no long-term lock-in beyond the term you\'ve already paid for.',
  },
  {
    q: 'Is there a free trial or onboarding support?',
    a: 'You can explore the product with no card required to start. Once you\'re set up, our team is reachable at support@agentix.in for onboarding help — connecting your number, building your knowledge base, and getting your first campaign out.',
  },
  {
    q: 'Does the AI agent take payments?',
    a: 'Yes — it can send a Razorpay payment link inside the conversation, so a customer can pay without leaving the chat. AGENTiX never stores card or bank details itself; that runs through Razorpay.',
  },
  {
    q: 'What languages does the AI agent support?',
    a: 'It reads and replies naturally in Hindi, English, and Hinglish — matching whatever mix the customer writes in, since that\'s how most Indian customers actually message.',
  },
];

export default function FaqPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>FAQ</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            Questions, answered.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            Everything you need to know before you connect your first number.
          </p>
        </div>
      </Section>

      {/* ── FAQ list ─────────────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="mx-auto max-w-2xl">
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

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with AGENTiX — email support@agentix.in or send a message, or skip straight to signing up free.',
};

export default function ContactPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>Contact</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            Talk to us.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            Questions about pricing, onboarding, or whether AGENTiX fits your business? Reach out — or
            just get started, no card required.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-offset-navy-900">
              <Link href="/signup">
                Get Started free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <a
              href="mailto:support@agentix.in"
              className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              support@agentix.in
            </a>
          </div>
        </div>
      </Section>

      {/* ── Contact form ─────────────────────────────────────────────────── */}
      <Section variant="warm">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <Eyebrow>Send a message</Eyebrow>
            <DisplayHeading as="h2">We&apos;ll get back to you.</DisplayHeading>
            <p className="mt-4 text-base leading-relaxed text-navy-900/60">
              Fill this in and it goes straight to our team&apos;s inbox.
            </p>
          </div>
          <div className="mt-10">
            <ContactForm />
          </div>
        </div>
      </Section>
    </>
  );
}

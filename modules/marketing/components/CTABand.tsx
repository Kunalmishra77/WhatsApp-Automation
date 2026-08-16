import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DisplayHeading } from './DisplayHeading';

interface CTABandProps {
  heading?: string;
  subcopy?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

/** Recurring orange/navy "start free" band. Reused at the bottom of most marketing pages. */
export function CTABand({
  heading = 'Start free — no card to explore.',
  subcopy = 'Set up your AI agent in minutes and see every conversation land in one inbox.',
  ctaLabel = 'Get Started',
  ctaHref = '/signup',
}: CTABandProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-900 to-brand-800 px-6 py-14 text-center shadow-xl sm:px-16 sm:py-20">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="relative mx-auto max-w-2xl">
        <DisplayHeading as="h2" className="text-white">
          {heading}
        </DisplayHeading>
        <p className="mx-auto mt-4 max-w-lg text-base text-white/70">{subcopy}</p>
        <Button
          asChild
          size="lg"
          className="mt-8 bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-offset-navy-900"
        >
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

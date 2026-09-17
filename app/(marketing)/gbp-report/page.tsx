import type { Metadata } from 'next';
import { GbpReportTool } from './GbpReportTool';
import { Star, TrendingUp, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Free Google Business Profile Report',
  description:
    'Get a free instant health score for your Google Business Profile — see exactly what to fix to rank higher on Google Search & Maps and get more customers.',
};

export default function GbpReportPage() {
  return (
    <>
      {/* Hero + tool */}
      <section className="relative -mt-16 overflow-hidden bg-slate-900 pb-20 pt-28 sm:pt-32">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-900/30 to-transparent" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-300">
            Free · Instant · No signup
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How healthy is your <span className="text-brand-400">Google Business Profile?</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/70">
            Get an instant health score and see exactly what to fix to rank higher on Google Search &amp; Maps —
            and turn searches into customers.
          </p>
          <div className="mt-8">
            <GbpReportTool />
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid gap-8 sm:grid-cols-3 text-center">
            {[
              { icon: Star, title: 'Rank higher on Maps', body: 'A complete, active profile ranks above competitors when customers search nearby.' },
              { icon: TrendingUp, title: 'Turn searches into calls', body: 'Photos, hours, reviews and a website turn profile views into calls, directions and bookings.' },
              { icon: ShieldCheck, title: 'Know exactly what to fix', body: 'Your report lists every gap with a clear tip — no guesswork.' },
            ].map((b) => (
              <div key={b.title}>
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                  <b.icon className="h-5 w-5 text-brand-500" />
                </div>
                <h3 className="font-semibold text-gray-900">{b.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

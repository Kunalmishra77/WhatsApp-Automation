import Link from 'next/link';
import { Brain, MessageSquare, Bot, TrendingUp, Zap, Users, BarChart3, Check } from 'lucide-react';

const CONTACT_EMAIL = 'support@agentix.in';

// ── AGENTiX wordmark — matches the login screen identity ──────────────────────
function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/30">
        <Brain className="h-5 w-5 text-white" strokeWidth={1.8} />
      </span>
      <span className="leading-none">
        <span className={`block text-lg font-bold tracking-wide ${dark ? 'text-white' : 'text-navy-900'}`}>
          <span className="text-brand-500">A</span>GENT<span className={dark ? 'text-white/70' : 'text-navy-900/60'}>i</span><span className="text-brand-500">X</span>
        </span>
        <span className={`block text-[9px] font-medium uppercase tracking-widest ${dark ? 'text-white/40' : 'text-navy-900/40'}`}>
          AI Automation
        </span>
      </span>
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/"><Logo /></Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-slate-500 transition-colors hover:text-navy-900">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-500 transition-colors hover:text-navy-900">How it Works</a>
            <a href="#pricing" className="text-sm font-medium text-slate-500 transition-colors hover:text-navy-900">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-slate-600 hover:text-navy-900 sm:inline">Client Login</Link>
            <Link
              href="/login"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
            >
              Access Dashboard →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy-900 pb-24 pt-20">
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, #e8622a 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        {/* Glow orbs — brand orange */}
        <div className="pointer-events-none absolute left-1/4 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 top-1/2 h-64 w-64 translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
            India&apos;s #1 AI Automation Partner
          </div>

          <h1 className="mb-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-6xl">
            Automate your{' '}
            <span className="text-gradient-brand">WhatsApp sales</span>{' '}
            with AI
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/50">
            Turn every WhatsApp conversation into a closed deal. AI auto-replies, lead scoring,
            smart chatbot flows and bulk campaigns — all in one intelligent dashboard built for Indian businesses.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="rounded-xl bg-brand-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition-all hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-500/40"
            >
              Access Dashboard →
            </Link>
            <a
              href="#how-it-works"
              className="rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
            >
              See How It Works
            </a>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-white/40">
            {['🔒 Enterprise Security', '🇮🇳 Made for India', '⚡ 5-min Setup', '💬 WhatsApp Native', '📊 Real-time Analytics'].map((badge) => (
              <span key={badge} className="font-medium">{badge}</span>
            ))}
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div className="relative mx-auto mt-16 max-w-5xl px-6">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-navy-800/60 shadow-2xl shadow-black/60 backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-500/70" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <div className="h-3 w-3 rounded-full bg-green-500/70" />
              <div className="ml-2 h-5 w-56 rounded bg-white/5 text-center text-[10px] leading-5 text-white/40">app.aiagentixdev.com/conversations</div>
            </div>
            {/* Fake dashboard UI */}
            <div className="flex h-64 gap-0">
              {/* Sidebar */}
              <div className="w-14 border-r border-white/5 bg-navy-950/50 py-4 flex flex-col items-center gap-3">
                {['💬', '👥', '📊', '📢', '⚙️'].map((icon, i) => (
                  <div key={i} className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${i === 0 ? 'bg-brand-500/20' : ''}`}>{icon}</div>
                ))}
              </div>
              {/* Conversation list */}
              <div className="w-56 border-r border-white/5 bg-navy-950/30 p-3 space-y-2">
                {[
                  { name: 'Priya Sharma', msg: 'Is the offer still valid?', time: '2m', hot: true },
                  { name: 'Rahul Gupta', msg: 'Thanks! Order confirmed ✓', time: '15m', hot: false },
                  { name: 'Anita Singh', msg: 'What are your timings?', time: '1h', hot: false },
                ].map((c) => (
                  <div key={c.name} className="flex items-start gap-2 rounded-lg p-2 bg-white/[0.03]">
                    <div className="h-7 w-7 shrink-0 rounded-full bg-brand-500/30 text-center text-xs leading-7 text-brand-300">{c.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-white truncate">{c.name}</span>
                        <span className="text-[9px] text-white/40">{c.time}</span>
                      </div>
                      <p className="text-[10px] text-white/50 truncate">{c.msg}</p>
                    </div>
                    {c.hot && <div className="h-2 w-2 shrink-0 rounded-full bg-brand-400 mt-1" />}
                  </div>
                ))}
              </div>
              {/* Chat area */}
              <div className="flex-1 p-4 space-y-3">
                <div className="flex justify-start"><div className="max-w-xs rounded-2xl rounded-tl-sm bg-white/10 px-3 py-2 text-[11px] text-white/70">Is the offer still valid for today?</div></div>
                <div className="flex justify-end"><div className="max-w-xs rounded-2xl rounded-tr-sm bg-brand-500 px-3 py-2 text-[11px] text-white">Yes! 20% off valid until midnight tonight 🎉</div></div>
                <div className="flex items-center gap-2 rounded-lg bg-brand-500/10 px-3 py-1.5 text-[10px] text-brand-300 border border-brand-500/20">
                  <span>🤖</span> AI suggested reply — click to send
                </div>
              </div>
              {/* Stats panel */}
              <div className="hidden w-44 border-l border-white/5 bg-navy-950/30 p-3 space-y-3 lg:block">
                {[
                  { label: 'Messages today', val: '847', color: 'text-brand-400' },
                  { label: 'Open leads', val: '23', color: 'text-amber-400' },
                  { label: 'Resolved', val: '156', color: 'text-emerald-400' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-white/[0.03] p-2">
                    <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
                    <div className="text-[10px] text-white/40">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-500">Features</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-navy-900 md:text-4xl">
              Everything your business needs
            </h2>
            <p className="mt-4 text-lg text-slate-500">One platform to handle all your WhatsApp business communications</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Bot, title: 'AI Auto-Reply', desc: 'Instant replies 24/7 in 8 Indian languages, trained on your business knowledge. Never miss a lead again.' },
              { icon: TrendingUp, title: 'CRM Pipeline', desc: 'Track every lead from first message to closed deal with a Kanban-style pipeline and lead scoring.' },
              { icon: MessageSquare, title: 'Bulk Campaigns', desc: 'Send promotions to thousands of contacts in one click with real-time delivery analytics.' },
              { icon: Brain, title: 'Smart Flows', desc: 'Build automated conversation flows with a visual drag-and-drop builder — no code needed.' },
              { icon: BarChart3, title: 'Analytics', desc: 'Know what\'s working with real-time reports on messages, response times and conversion rates.' },
              { icon: Users, title: 'Team Inbox', desc: 'Multiple agents on one number. Assign conversations, see who\'s online, track performance.' },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-100 bg-white p-6 transition-shadow hover:shadow-md">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-bold text-navy-900">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-500">Process</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-navy-900 md:text-4xl">Up and running in minutes</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { num: '01', icon: '🔗', title: 'Connect WhatsApp', desc: 'Link your WhatsApp Business API number. Enter your Phone Number ID and Access Token — takes under 5 minutes.' },
              { num: '02', icon: '⚙️', title: 'Set Up Automation', desc: 'Add your team, build chatbot flows, configure AI auto-replies. Your assistant is trained and ready.' },
              { num: '03', icon: '🚀', title: 'Grow Your Business', desc: 'Watch leads, conversations and revenue grow. Get daily digest emails with your key business metrics.' },
            ].map((step) => (
              <div key={step.num} className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-5xl font-black text-slate-100">{step.num}</span>
                  <span className="text-2xl">{step.icon}</span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-navy-900">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-navy-900">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-4 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-400">Pricing</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Simple, transparent pricing</h2>
            <p className="mt-3 text-white/50">One complete platform. Add Instagram whenever you need it.</p>
          </div>

          <div className="mt-12 grid items-stretch gap-6 md:grid-cols-2">
            {/* Main plan — WhatsApp Automation Platform */}
            <div className="relative rounded-2xl border border-brand-500/30 bg-brand-500/[0.06] p-8 ring-1 ring-brand-500/20">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-brand-500 px-4 py-1 text-[11px] font-bold text-white shadow-lg shadow-brand-500/30">
                  COMPLETE PLATFORM
                </span>
              </div>
              <p className="text-sm font-semibold text-brand-300">WhatsApp Automation Platform</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-black text-white">₹2,999</span>
                <span className="mb-1 text-white/50">/month</span>
              </div>
              <p className="mt-1 text-xs text-white/40">Everything you need to run WhatsApp sales on autopilot</p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  'AI auto-reply in 8 Indian languages',
                  'WhatsApp CRM & lead pipeline',
                  'Smart chatbot flow builder',
                  'Bulk campaigns + real-time analytics',
                  'Team inbox & agent management',
                  'Knowledge base + AI training',
                  'Google Calendar & integrations',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-white/80">
                    <Check className="h-4 w-4 shrink-0 text-brand-400" /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="mt-8 flex w-full items-center justify-center rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition-all hover:bg-brand-600">
                Access Dashboard →
              </Link>
            </div>

            {/* Instagram Add-on */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <p className="text-sm font-semibold text-white/60">Instagram Add-on</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-black text-white">+₹999</span>
                <span className="mb-1 text-white/50">/month</span>
              </div>
              <p className="mt-1 text-xs text-white/40">Added on top of the ₹2,999 platform subscription</p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  'Instagram DM automation',
                  'Unified WhatsApp + Instagram inbox',
                  'AI replies on Instagram messages',
                  'Instagram lead capture into CRM',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-white/80">
                    <Check className="h-4 w-4 shrink-0 text-brand-400" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl border border-white/10 bg-navy-950/40 p-4 text-center">
                <p className="text-xs text-white/50">Platform + Instagram</p>
                <p className="mt-1 text-2xl font-black text-white">₹3,998<span className="text-sm font-medium text-white/50">/month</span></p>
              </div>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Instagram Add-on`} className="mt-6 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
                Contact Sales →
              </a>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-white/40">
            All plans are billed monthly. No hidden fees. Prices exclusive of applicable taxes.
          </p>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-navy-900">Trusted by businesses across India</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { name: 'Rajesh Sharma', biz: 'Sharma Medical Store, Delhi', quote: 'We now handle 500+ patient queries daily on WhatsApp with just 2 staff. The AI auto-reply saves us 4 hours every day.' },
              { name: 'Priya Mehta', biz: 'Mehta Coaching Classes, Mumbai', quote: 'Campaigns for exam reminders reach all 2,000 students in minutes. Our enrollment conversion went up 40% in 3 months.' },
              { name: 'Suresh Gupta', biz: 'Gupta Travels, Bangalore', quote: 'The CRM pipeline helps us track every booking inquiry. We\'ve never lost a lead since we started using AGENTiX.' },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-slate-100 bg-white p-6">
                <p className="text-sm leading-relaxed text-slate-700">&quot;{t.quote}&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-600">{t.name[0]}</div>
                  <div>
                    <p className="text-sm font-semibold text-navy-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.biz}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-brand-500 py-20">
        <div className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, #fff 0%, transparent 60%)' }} />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Ready to grow with WhatsApp?
          </h2>
          <p className="mb-8 text-lg text-white/80">Join 500+ businesses already using AGENTiX to automate and scale</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-brand-600 shadow-xl shadow-brand-900/20 transition-all hover:-translate-y-0.5 hover:shadow-2xl"
            >
              Access Dashboard →
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Get started with AGENTiX`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-white py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <Logo />
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/terms" className="hover:text-navy-900">Terms</Link>
              <Link href="/privacy-policy" className="hover:text-navy-900">Privacy Policy</Link>
              <Link href="/data-deletion" className="hover:text-navy-900">Data Deletion</Link>
              <Link href="/login" className="hover:text-navy-900">Client Login</Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">© 2026 AGENTiX · Enterprise WhatsApp CRM Platform · Made with ♥ in India</p>
        </div>
      </footer>
    </div>
  );
}

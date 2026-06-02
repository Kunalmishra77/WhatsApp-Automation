import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0ea5e9] text-sm font-bold text-white shadow-md shadow-sky-200">
              A
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">Agentix</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">How it Works</a>
            <a href="#pricing" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">Sign in</Link>
            <Link
              href="/signup"
              className="rounded-lg bg-[#0ea5e9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0284c7]"
            >
              Get Started →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950 pb-24 pt-20">
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow orbs */}
        <div className="pointer-events-none absolute left-1/4 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0ea5e9]/20 blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 top-1/2 h-64 w-64 translate-x-1/2 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-1.5 text-xs font-semibold text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            AI-Powered WhatsApp CRM · Made for India
          </div>

          <h1 className="mb-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-6xl">
            Turn WhatsApp into your{' '}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-[#0ea5e9] to-sky-300 bg-clip-text text-transparent">
                #1 Sales Channel
              </span>
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-400">
            Automate replies, manage leads, run bulk campaigns — all from one intelligent dashboard.
            Built for Indian businesses that live on WhatsApp.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-xl bg-[#0ea5e9] px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/30 transition-all hover:-translate-y-0.5 hover:bg-[#0284c7] hover:shadow-xl hover:shadow-sky-500/40"
            >
              Start for ₹1,499/month →
            </Link>
            <a
              href="#how-it-works"
              className="rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
            >
              See How It Works
            </a>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-slate-500">
            {['🔒 Enterprise Security', '🇮🇳 Made for India', '⚡ 5-min Setup', '💬 WhatsApp Native', '📊 Real-time Analytics'].map((badge) => (
              <span key={badge} className="font-medium">{badge}</span>
            ))}
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div className="relative mx-auto mt-16 max-w-5xl px-6">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-800/60 shadow-2xl shadow-black/60 backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-500/70" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <div className="h-3 w-3 rounded-full bg-green-500/70" />
              <div className="ml-2 h-5 w-48 rounded bg-white/5 text-center text-[10px] leading-5 text-slate-500">app.agentix.in/conversations</div>
            </div>
            {/* Fake dashboard UI */}
            <div className="flex h-64 gap-0">
              {/* Sidebar */}
              <div className="w-14 border-r border-white/5 bg-slate-900/50 py-4 flex flex-col items-center gap-3">
                {['💬', '👥', '📊', '📢', '⚙️'].map((icon, i) => (
                  <div key={i} className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${i === 0 ? 'bg-sky-500/20' : ''}`}>{icon}</div>
                ))}
              </div>
              {/* Conversation list */}
              <div className="w-56 border-r border-white/5 bg-slate-900/30 p-3 space-y-2">
                {[
                  { name: 'Priya Sharma', msg: 'Is the offer still valid?', time: '2m', hot: true },
                  { name: 'Rahul Gupta', msg: 'Thanks! Order confirmed ✓', time: '15m', hot: false },
                  { name: 'Anita Singh', msg: 'What are your timings?', time: '1h', hot: false },
                ].map((c) => (
                  <div key={c.name} className="flex items-start gap-2 rounded-lg p-2 bg-white/[0.03]">
                    <div className="h-7 w-7 shrink-0 rounded-full bg-sky-500/30 text-center text-xs leading-7 text-sky-300">{c.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-white truncate">{c.name}</span>
                        <span className="text-[9px] text-slate-500">{c.time}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{c.msg}</p>
                    </div>
                    {c.hot && <div className="h-2 w-2 shrink-0 rounded-full bg-orange-400 mt-1" />}
                  </div>
                ))}
              </div>
              {/* Chat area */}
              <div className="flex-1 p-4 space-y-3">
                <div className="flex justify-start"><div className="max-w-xs rounded-2xl rounded-tl-sm bg-white/10 px-3 py-2 text-[11px] text-slate-300">Is the offer still valid for today?</div></div>
                <div className="flex justify-end"><div className="max-w-xs rounded-2xl rounded-tr-sm bg-sky-500 px-3 py-2 text-[11px] text-white">Yes! 20% off valid until midnight tonight 🎉</div></div>
                <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-1.5 text-[10px] text-sky-400 border border-sky-500/20">
                  <span>🤖</span> AI suggested reply — click to send
                </div>
              </div>
              {/* Stats panel */}
              <div className="w-44 border-l border-white/5 bg-slate-900/30 p-3 space-y-3">
                {[
                  { label: 'Messages today', val: '847', color: 'text-sky-400' },
                  { label: 'Open leads', val: '23', color: 'text-amber-400' },
                  { label: 'Resolved', val: '156', color: 'text-emerald-400' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-white/[0.03] p-2">
                    <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
                    <div className="text-[10px] text-slate-500">{s.label}</div>
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
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#0ea5e9]">Features</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
              Everything your business needs
            </h2>
            <p className="mt-4 text-lg text-slate-500">One platform to handle all your WhatsApp business communications</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: '🤖', title: 'AI Auto-Reply', desc: 'Instant replies 24/7, trained on your business knowledge. Never miss a lead again.', color: 'bg-sky-50 border-sky-100' },
              { icon: '📊', title: 'CRM Pipeline', desc: 'Track every lead from first message to closed deal with Kanban-style pipeline management.', color: 'bg-violet-50 border-violet-100' },
              { icon: '📢', title: 'Bulk Campaigns', desc: 'Send promotions to thousands of contacts in one click with real-time delivery analytics.', color: 'bg-orange-50 border-orange-100' },
              { icon: '🧠', title: 'Smart Flows', desc: 'Build automated conversation flows with a visual drag-and-drop builder — no code needed.', color: 'bg-emerald-50 border-emerald-100' },
              { icon: '📈', title: 'Analytics', desc: 'Know what\'s working with real-time reports on messages, response times, and conversion rates.', color: 'bg-amber-50 border-amber-100' },
              { icon: '👥', title: 'Team Inbox', desc: 'Multiple agents on one number. Assign conversations, see who\'s online, track performance.', color: 'bg-pink-50 border-pink-100' },
            ].map((f) => (
              <div key={f.title} className={`rounded-2xl border p-6 transition-shadow hover:shadow-md ${f.color}`}>
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="mb-2 text-base font-bold text-slate-900">{f.title}</h3>
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
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#0ea5e9]">Process</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Up and running in minutes</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { num: '01', icon: '🔗', title: 'Connect WhatsApp', desc: 'Link your WhatsApp Business API number. Enter your Phone Number ID and Access Token — takes under 5 minutes.' },
              { num: '02', icon: '⚙️', title: 'Set Up Automation', desc: 'Add your team, build chatbot flows, configure auto-replies. Your AI assistant is trained and ready.' },
              { num: '03', icon: '🚀', title: 'Grow Your Business', desc: 'Watch leads, conversations and revenue grow. Get daily digest emails with your key business metrics.' },
            ].map((step) => (
              <div key={step.num} className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-5xl font-black text-slate-100">{step.num}</span>
                  <span className="text-2xl">{step.icon}</span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-slate-950">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-4 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-sky-400">Pricing</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Simple, transparent pricing</h2>
            <p className="mt-3 text-slate-400">No free trial. No hidden fees. Just results.</p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {/* Starter */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <p className="text-sm font-semibold text-slate-400">Starter</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-black text-white">₹1,499</span>
                <span className="mb-1 text-slate-400">/month</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">For small businesses getting started</p>
              <ul className="mt-6 space-y-3 text-sm">
                {['2 agents', '3,000 messages/mo', '1,000 contacts', '5 campaigns/mo', 'Basic AI auto-reply', 'WhatsApp inbox'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-300">
                    <span className="text-sky-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
                Get Started →
              </Link>
            </div>

            {/* Pro — highlighted */}
            <div className="relative rounded-2xl border border-sky-400/30 bg-sky-950/40 p-8 ring-1 ring-sky-400/20">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-sky-500 px-4 py-1 text-[11px] font-bold text-white shadow-lg shadow-sky-500/30">
                  MOST POPULAR
                </span>
              </div>
              <p className="text-sm font-semibold text-sky-300">Pro</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-black text-white">₹2,999</span>
                <span className="mb-1 text-slate-400">/month</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">For growing businesses</p>
              <ul className="mt-6 space-y-3 text-sm">
                {['10 agents', '25,000 messages/mo', '10,000 contacts', '50 campaigns/mo', 'Full AI features + CRM', 'A/B Testing & CSAT', 'SLA Management', 'Flow Builder (20 flows)'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-300">
                    <span className="text-sky-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 flex w-full items-center justify-center rounded-xl bg-sky-500 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/30 transition-all hover:bg-sky-400">
                Get Started →
              </Link>
            </div>

            {/* Enterprise */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <p className="text-sm font-semibold text-slate-400">Enterprise</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-black text-white">₹9,999</span>
                <span className="mb-1 text-slate-400">/month</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">For large businesses &amp; agencies</p>
              <ul className="mt-6 space-y-3 text-sm">
                {['25 agents', '1,00,000 messages/mo', '50,000 contacts', '200 campaigns/mo', 'White label branding', 'Custom domain', 'Priority 24/7 support', 'Dedicated onboarding'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-300">
                    <span className="text-sky-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="mailto:sales@agentix.in" className="mt-8 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
                Contact Sales →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Trusted by businesses across India</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { name: 'Rajesh Sharma', biz: 'Sharma Medical Store, Delhi', quote: 'We now handle 500+ patient queries daily on WhatsApp with just 2 staff. The AI auto-reply saves us 4 hours every day.' },
              { name: 'Priya Mehta', biz: 'Mehta Coaching Classes, Mumbai', quote: 'Campaigns for exam reminders reach all 2,000 students in minutes. Our enrollment conversion went up 40% in 3 months.' },
              { name: 'Suresh Gupta', biz: 'Gupta Travels, Bangalore', quote: 'The CRM pipeline helps us track every booking inquiry. We\'ve never lost a lead since we started using Agentix.' },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                <p className="text-sm leading-relaxed text-slate-700">&quot;{t.quote}&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-600">{t.name[0]}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.biz}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0ea5e9] py-20">
        <div className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, #fff 0%, transparent 60%)' }} />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Ready to grow with WhatsApp?
          </h2>
          <p className="mb-8 text-lg text-sky-100">Join 100+ businesses already using Agentix to automate and scale</p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-sky-600 shadow-xl shadow-sky-700/20 transition-all hover:-translate-y-0.5 hover:shadow-2xl"
          >
            Start Today for ₹1,499/month →
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-white py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0ea5e9] text-xs font-bold text-white">A</div>
              <span className="font-bold text-slate-900">Agentix</span>
              <span className="text-slate-400 text-sm">· AI-powered WhatsApp CRM for Indian businesses</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/terms" className="hover:text-slate-900">Terms</Link>
              <Link href="/privacy-policy" className="hover:text-slate-900">Privacy Policy</Link>
              <Link href="/data-deletion" className="hover:text-slate-900">Data Deletion</Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">© 2026 Agentix. Made with ♥ in India</p>
        </div>
      </footer>
    </div>
  );
}

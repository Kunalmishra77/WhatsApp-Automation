'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Brain, MessageSquare, Bot, TrendingUp, Zap } from 'lucide-react';

interface AuthCardProps {
  children:  React.ReactNode;
  title:     string;
  subtitle?: string;
  className?: string;
}

const FEATURES = [
  { icon: MessageSquare, text: 'WhatsApp CRM & Automation at scale' },
  { icon: Bot,          text: 'AI chatbot flows that close deals' },
  { icon: TrendingUp,   text: 'Lead scoring & revenue intelligence' },
  { icon: Zap,          text: 'Bulk campaigns with real-time analytics' },
];

const STATS = [
  { value: '500+',  label: 'Businesses' },
  { value: '10M+',  label: 'Messages sent' },
  { value: '99.9%', label: 'Uptime SLA' },
];

export function AuthCard({ children, title, subtitle, className }: AuthCardProps) {
  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Left branding panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col bg-navy-900 overflow-hidden">
        {/* Background orbs */}
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.08, 0.14, 0.08] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-brand-500/8 blur-3xl"
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-navy-800/80 blur-2xl" />

        {/* Grid dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, #e8622a 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10 flex flex-col h-full px-10 xl:px-14 py-10">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-900/50">
              <Brain className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-lg font-bold tracking-wide text-white leading-none">
                <span className="text-brand-400">A</span>GENT
                <span className="text-white/80">i</span>
                <span className="text-brand-400">X</span>
              </p>
              <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest mt-0.5">
                AI Automation
              </p>
            </div>
          </motion.div>

          {/* Main content — centered vertically */}
          <div className="flex-1 flex flex-col justify-center">
            {/* Tagline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.55 }}
              className="mb-10"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 border border-brand-500/20 px-3 py-1.5 mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
                <span className="text-xs font-semibold text-brand-300 tracking-wide">
                  India's #1 AI Automation Partner
                </span>
              </div>

              <h1 className="text-3xl xl:text-4xl font-bold leading-tight text-white">
                Automate your{' '}
                <span className="text-gradient-brand">WhatsApp sales</span>{' '}
                with AI
              </h1>
              <p className="mt-4 text-white/50 text-base leading-relaxed max-w-md">
                Turn every WhatsApp conversation into a closed deal. AI lead scoring,
                smart flows, bulk campaigns — all in one platform.
              </p>
            </motion.div>

            {/* Feature bullets — staggered */}
            <div className="space-y-3.5 mb-10">
              {FEATURES.map(({ icon: Icon, text }, i) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                    <Icon className="h-4 w-4 text-brand-400" />
                  </div>
                  <span className="text-sm text-white/70 font-medium">{text}</span>
                </motion.div>
              ))}
            </div>

            {/* Social proof stats */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              className="flex items-center gap-6 pt-8 border-t border-white/[0.08]"
            >
              {STATS.map((s) => (
                <div key={s.label}>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Footer */}
          <p className="text-[11px] text-white/25 mt-6">
            © {new Date().getFullYear()} AGENTiX · Enterprise WhatsApp CRM Platform
          </p>
        </div>
      </div>

      {/* ── Right auth form panel ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-1 flex-col items-center justify-center px-6 py-10 lg:py-12 bg-background"
      >
        <div className="w-full max-w-sm">

          {/* Mobile-only logo */}
          <div className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/30">
              <Brain className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>
            <p className="text-base font-bold tracking-wide text-foreground">
              <span className="text-brand-500">A</span>GENT
              <span className="text-foreground/70">i</span>
              <span className="text-brand-500">X</span>
            </p>
          </div>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={cn(
              'rounded-2xl border border-border bg-card',
              'shadow-[0_8px_30px_rgb(0,0,0,0.07),0_2px_8px_rgb(0,0,0,0.05)]',
              'p-7',
              className,
            )}
          >
            <div className="mb-6">
              <h2 className="text-xl font-bold text-foreground">{title}</h2>
              {subtitle && (
                <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {children}
          </motion.div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} AGENTiX · Enterprise WhatsApp CRM
          </p>
        </div>
      </motion.div>

    </div>
  );
}

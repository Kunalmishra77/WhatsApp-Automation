'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}

const cardVariant = {
  initial: { opacity: 0, scale: 0.97, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export function AuthCard({ children, title, subtitle, className }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4 py-12">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-xl font-bold text-white shadow-lg shadow-brand-500/25">
            A
          </div>
          <p className="text-label font-semibold uppercase tracking-widest text-brand-600">
            Agentix
          </p>
        </div>

        {/* Card */}
        <motion.div
          variants={cardVariant}
          initial="initial"
          animate="animate"
          className={cn(
            'rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5',
            className,
          )}
        >
          <div className="mb-6">
            <h1 className="text-heading-lg font-semibold text-foreground">{title}</h1>
            {subtitle && (
              <p className="mt-1.5 text-body-md text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {children}
        </motion.div>

        {/* Footer */}
        <p className="mt-6 text-center text-caption text-muted-foreground">
          © {new Date().getFullYear()} Agentix. Enterprise WhatsApp CRM.
        </p>
      </div>
    </div>
  );
}

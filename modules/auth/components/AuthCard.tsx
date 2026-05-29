import { cn } from '@/lib/utils';

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}

export function AuthCard({ children, title, subtitle, className }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">

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
        <div
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
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-caption text-muted-foreground">
          © {new Date().getFullYear()} Agentix. Enterprise WhatsApp CRM.
        </p>
      </div>
    </div>
  );
}

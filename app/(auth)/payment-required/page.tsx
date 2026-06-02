import Link from 'next/link';

export default function PaymentRequiredPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-brand-500/30">
            A
          </div>
        </div>

        {/* Icon + Title */}
        <div className="space-y-2">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-2xl font-bold text-foreground">Subscription Paused</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your Agentix subscription payment could not be processed and your account has been temporarily paused.
          </p>
        </div>

        {/* Data safe notice */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✅ Your data is completely safe — nothing has been deleted.
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Link
            href="/settings"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            💳 Go to Billing Settings
          </Link>
          <p className="text-xs text-muted-foreground">
            Questions?{' '}
            <a href="https://wa.me/919125000000" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              WhatsApp us
            </a>
            {' '}or{' '}
            <a href="mailto:support@agentix.in" className="underline hover:text-foreground">
              email support
            </a>
          </p>
        </div>

        {/* Sign out link */}
        <p className="text-xs text-muted-foreground">
          Wrong account?{' '}
          <Link href="/login" className="underline hover:text-foreground">Sign in with a different account</Link>
        </p>
      </div>
    </div>
  );
}

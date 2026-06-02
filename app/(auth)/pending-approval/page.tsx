export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-xl font-bold">A</div>
        </div>
        <div className="space-y-2">
          <div className="text-4xl">⏳</div>
          <h1 className="text-2xl font-bold text-foreground">Account Pending Approval</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your account setup is complete. Our team is reviewing your details and will activate your account shortly.
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          ✅ You will receive an email once your account is activated.
        </div>
        <p className="text-xs text-muted-foreground">
          Questions? <a href="mailto:support@agentix.in" className="underline">support@agentix.in</a>
        </p>
      </div>
    </div>
  );
}

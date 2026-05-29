interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-secondary">
      {/* Sidebar — Phase 4 */}
      <aside className="w-64 shrink-0 border-r border-border bg-surface-primary" />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

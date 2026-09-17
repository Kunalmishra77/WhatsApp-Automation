'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Shows an "Install app" button only when the browser reports the PWA is
// installable (Chrome/Edge/Android). On iOS Safari there is no prompt event —
// users install via Share -> Add to Home Screen — so nothing renders there.
export function PwaInstallButton({ collapsed }: { collapsed?: boolean }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <button
      onClick={() => void install()}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-150',
        'text-brand-300 hover:bg-white/[0.07] hover:text-brand-200',
        collapsed && 'justify-center px-2',
      )}
      title={collapsed ? 'Install app' : undefined}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Download className="h-4 w-4" />
      </div>
      {!collapsed && 'Install app'}
    </button>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Brain, CheckCircle2, AlertCircle, ExternalLink, Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface InstagramAccount {
  id: string;
  ig_username?: string;
  page_name?: string;
}

export function MetaAdsSettings() {
  const [igAccounts, setIgAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/instagram')
      .then((r) => r.json())
      .then((d) => setIgAccounts(d.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const connected = igAccounts.length > 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-orange-500" />
          Meta Ads Integration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically detect conversations from Click-to-WhatsApp ads and track leads.
        </p>
      </div>

      {/* Connection status */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium">Connection Status</p>

        <div className="flex items-start gap-3">
          {connected
            ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            : <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
          <div>
            <p className="text-sm font-medium">
              {connected ? 'WhatsApp connected via Meta Business' : 'WhatsApp not yet connected'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connected
                ? 'Your WhatsApp Business number is linked to a Meta Business account. Ad referrals will be detected automatically.'
                : 'Connect your WhatsApp Business number to a Meta Business account to enable ad lead detection.'}
            </p>
          </div>
        </div>

        {connected && igAccounts.map((acc) => (
          <div key={acc.id} className="ml-8 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {acc.ig_username ? `@${acc.ig_username}` : acc.page_name ?? 'Facebook Page'}
            </Badge>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium">How Ad Lead Detection Works</p>
        <ol className="space-y-2.5 text-sm text-muted-foreground list-decimal ml-4">
          <li>Customer clicks your Facebook or Instagram ad (Click-to-WhatsApp campaign)</li>
          <li>They send a WhatsApp message — the system automatically reads Meta&apos;s referral data</li>
          <li>The conversation is tagged with <strong className="text-foreground">Meta Ad Lead</strong> and the ad details are saved</li>
          <li>The lead appears in the <strong className="text-foreground">Meta Leads</strong> dashboard with ad headline, body, and click ID</li>
        </ol>
      </div>

      {/* What is captured */}
      <div className="rounded-xl border border-border p-4 space-y-2">
        <p className="text-sm font-medium">Data Captured Per Ad Lead</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          {[
            'Ad Headline', 'Ad Body / Description',
            'Facebook Ad ID', 'Click Tracking ID (ctwa_clid)',
            'Platform (Facebook / Instagram)', 'Detection timestamp',
          ].map((item) => (
            <div key={item} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Setup instructions */}
      {!connected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Setup Required</p>
          <p className="text-sm text-amber-700">
            Go to <strong>Settings → Instagram DM</strong> to connect your Facebook Page (which links your WhatsApp Business number to Meta). Once connected, ad referral detection activates automatically — no additional configuration needed.
          </p>
          <a
            href="/settings?tab=instagram"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 mt-1"
          >
            Go to Instagram Settings <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {/* No approval needed notice */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-xs text-blue-700">
          <strong>No Meta App Review required.</strong> Ad referral data is included automatically in every Click-to-WhatsApp webhook payload — no special API permissions or OAuth flow is needed.
        </p>
      </div>
    </div>
  );
}

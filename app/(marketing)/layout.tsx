import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { MarketingNav } from '@/modules/marketing/components/MarketingNav';
import { MarketingFooter } from '@/modules/marketing/components/MarketingFooter';

// Display font for marketing headlines only — body/UI keeps Inter (loaded in the root layout).
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://agentix.in'),
  title: {
    default: 'AGENTiX — AI Applied, Growth Multiplied.',
    template: '%s | AGENTiX',
  },
  description:
    'The bundled live AI agent for WhatsApp + Instagram. Answer every customer instantly, auto-qualify leads with a hot/warm/cold CRM, and grow — one inbox, one flat price.',
  keywords: [
    'WhatsApp API',
    'WhatsApp automation',
    'AI agent for WhatsApp',
    'WhatsApp CRM',
    'Instagram DM automation',
    'WhatsApp Business API India',
  ],
  icons: {
    icon: '/agentix-favicon.png',
  },
  openGraph: {
    title: 'AGENTiX — AI Applied, Growth Multiplied.',
    description:
      'The bundled live AI agent for WhatsApp + Instagram. Answer every customer instantly, auto-qualify leads, and grow with one inbox and one flat price.',
    url: 'https://agentix.in',
    siteName: 'AGENTiX',
    locale: 'en_IN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${bricolage.variable} flex min-h-screen flex-col bg-warm text-navy-900 antialiased [font-family:var(--font-inter),ui-sans-serif,system-ui,sans-serif]`}
    >
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

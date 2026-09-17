import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { PwaRegister } from '@/components/PwaRegister';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Agentix — WhatsApp CRM & Messaging Suite',
    template: '%s | Agentix',
  },
  description: 'Enterprise WhatsApp CRM & Messaging Suite for teams at scale.',
  keywords: ['WhatsApp CRM', 'messaging', 'customer support', 'automation'],
  authors: [{ name: 'Agentix Engineering' }],
  robots: { index: false, follow: false },
  applicationName: 'AGENTiX',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AGENTiX' },
  icons: {
    icon: '/agentix-favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          {children}
        </Providers>
        <PwaRegister />
      </body>
    </html>
  );
}

import type { MetadataRoute } from 'next';

// PWA manifest — makes AGENTiX installable on phones (Add to Home Screen).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AGENTiX — WhatsApp CRM & Messaging Suite',
    short_name: 'AGENTiX',
    description: 'Multi-channel WhatsApp + Instagram automation, CRM, campaigns, Google Business & Google Ads — in one place.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

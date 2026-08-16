import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/constants';

/** Static marketing routes only — authenticated app routes are intentionally excluded. */
const MARKETING_ROUTES = [
  '/',
  '/features',
  '/features/whatsapp-automation',
  '/features/ai-agent',
  '/features/campaigns',
  '/features/crm',
  '/features/shared-inbox',
  '/features/analytics',
  '/pricing',
  '/integrations',
  '/security',
  '/about',
  '/contact',
  '/faq',
  '/docs',
  '/privacy-policy',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return MARKETING_ROUTES.map((route) => ({
    url: `${APP_URL}${route}`,
    lastModified: now,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.7,
  }));
}

import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',  value: 'on' },
  { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'Referrer-Policy',         value: 'origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Razorpay Checkout loads its script from checkout.razorpay.com and opens
      // its payment UI in an iframe served from api.razorpay.com/checkout.razorpay.com.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in https://graph.facebook.com https://api.openai.com https://openrouter.ai https://api.resend.com https://*.razorpay.com https://lumberjack.razorpay.com",
    ].join('; '),
  },
];

const config: NextConfig = {
  output: 'standalone',

  // Dev-only route indicator badge — off so design/QA screenshots stay clean.
  // Has zero effect on production (Next.js only ever renders it under `next dev`).
  devIndicators: false,

  // Increase body size limit for KB document uploads (PDFs up to 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // CORS for public REST API (/api/v1/*)
      {
        source: '/api/v1/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-api-key' },
        ],
      },
      // Extra security headers on all API routes
      {
        source: '/api/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'Cache-Control',          value: 'no-store' },
        ],
      },
    ];
  },
};

export default config;

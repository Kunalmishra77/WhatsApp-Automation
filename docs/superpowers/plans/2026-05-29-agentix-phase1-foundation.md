# Agentix Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the complete Agentix Next.js 15 project with Tailwind CSS, shadcn/ui, Supabase SSR clients, TypeScript strict mode, and the full enterprise folder scaffold as specified in the master blueprint.

**Architecture:** Next.js 15 App Router with React Server Components by default; Tailwind CSS for styling; shadcn/ui for accessible component primitives; Supabase SSR for auth-aware server/browser clients; Zustand + TanStack Query wired up in a global Providers component.

**Tech Stack:** Next.js 15, TypeScript 5.x strict, Tailwind CSS 3.4+, shadcn/ui, @supabase/supabase-js, @supabase/ssr, Zustand 5.x, @tanstack/react-query v5, Framer Motion 11, Zod 3.x

---

## File Map

### Files Created
```
d:\WhatsApp-Automation\
├── next.config.ts
├── tsconfig.json                         (strict mode, path aliases)
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local.example
├── .env.local                            (gitignored, user fills in)
├── .gitignore
├── components.json                       (shadcn config)
├── middleware.ts                         (auth guard skeleton)
├── app/
│   ├── layout.tsx                        (root layout, font setup)
│   ├── globals.css                       (Tailwind directives + CSS vars)
│   ├── providers.tsx                     (QueryClient + Zustand + Toaster)
│   ├── (auth)/
│   │   ├── login/page.tsx                (placeholder — real impl Phase 2)
│   │   └── signup/page.tsx              (placeholder — real impl Phase 2)
│   └── (dashboard)/
│       ├── layout.tsx                    (placeholder shell)
│       └── page.tsx                     (placeholder dashboard)
├── components/
│   └── ui/                              (shadcn generates these)
├── lib/
│   ├── utils.ts                         (cn helper)
│   ├── constants.ts                     (app-wide constants)
│   └── validators.ts                    (shared Zod schemas)
├── services/
│   └── supabase/
│       ├── client.ts                    (browser Supabase client)
│       ├── server.ts                    (server Supabase client — cookies)
│       └── middleware.ts               (session refresh helper)
├── types/
│   ├── database.types.ts               (Supabase codegen placeholder)
│   ├── api.types.ts                    (standard response envelope)
│   └── auth.types.ts                  (JWT claims, roles)
├── store/
│   ├── auth.store.ts
│   ├── workspace.store.ts
│   ├── conversation.store.ts
│   ├── notification.store.ts
│   └── ui.store.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useWorkspace.ts
│   └── useDebounce.ts
├── animations/
│   ├── page.animations.ts
│   ├── list.animations.ts
│   └── modal.animations.ts
└── realtime/
    ├── channels.ts
    └── subscriptions.ts
```

---

## Task 1: Initialize Next.js 15 Project

**Files:**
- Create: `d:\WhatsApp-Automation\package.json` (replace existing)
- Create: `d:\WhatsApp-Automation\next.config.ts`
- Create: `d:\WhatsApp-Automation\tsconfig.json`
- Create: `d:\WhatsApp-Automation\.gitignore`

- [ ] **Step 1: Remove existing unrelated files**

```powershell
Remove-Item "d:\WhatsApp-Automation\index.js"
Remove-Item "d:\WhatsApp-Automation\package.json"
Remove-Item "d:\WhatsApp-Automation\package-lock.json"
```

- [ ] **Step 2: Create Next.js 15 project in current directory**

```powershell
cd "d:\WhatsApp-Automation"
npx create-next-app@latest . `
  --typescript `
  --tailwind `
  --eslint `
  --app `
  --no-src-dir `
  --import-alias "@/*" `
  --use-npm `
  --yes
```

Expected output: `Success! Created agentix at D:\WhatsApp-Automation`

- [ ] **Step 3: Verify project structure was created**

```powershell
Get-ChildItem "d:\WhatsApp-Automation" -Depth 1
```

Expected: `app/`, `components/`, `public/`, `package.json`, `next.config.ts`, `tsconfig.json` present.

- [ ] **Step 4: Install all blueprint dependencies**

```powershell
cd "d:\WhatsApp-Automation"
npm install `
  @supabase/supabase-js@^2.45.0 `
  @supabase/ssr@^0.5.0 `
  framer-motion@^11.0.0 `
  zustand@^5.0.0 `
  @tanstack/react-query@^5.0.0 `
  @tanstack/react-virtual@^3.0.0 `
  @dnd-kit/core@^6.1.0 `
  @dnd-kit/sortable@^8.0.0 `
  recharts@^2.12.0 `
  react-hook-form@^7.52.0 `
  zod@^3.23.0 `
  socket.io-client@^4.7.0 `
  date-fns@^3.6.0 `
  @upstash/redis@^1.31.0 `
  @upstash/ratelimit@^2.0.0 `
  openai@^4.52.0 `
  class-variance-authority@^0.7.0 `
  clsx@^2.1.0 `
  tailwind-merge@^2.4.0 `
  cmdk@^1.0.0 `
  sonner@^1.5.0 `
  papaparse@^5.4.0 `
  @tanstack/react-query-devtools@^5.0.0 `
  lucide-react@^0.400.0
```

- [ ] **Step 5: Install dev dependencies**

```powershell
npm install --save-dev `
  @types/papaparse `
  @types/node `
  @playwright/test@^1.45.0 `
  vitest@^2.0.0 `
  @vitejs/plugin-react@^4.0.0
```

- [ ] **Step 6: Verify no peer dependency errors**

```powershell
npm ls --depth=0 2>&1 | Select-String "WARN|ERR" | head -20
```

Expected: No critical errors. Minor peer warnings are acceptable.

- [ ] **Step 7: Commit**

```powershell
git init
git add package.json package-lock.json next.config.ts tsconfig.json .gitignore
git commit -m "feat: initialize Next.js 15 project with all blueprint dependencies"
```

---

## Task 2: Configure TypeScript (Strict Mode)

**Files:**
- Modify: `d:\WhatsApp-Automation\tsconfig.json`

- [ ] **Step 1: Replace tsconfig.json with strict configuration**

Write `d:\WhatsApp-Automation\tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Run type check to confirm baseline is clean**

```powershell
npx tsc --noEmit
```

Expected: Exit 0, no errors (app is skeleton at this point).

- [ ] **Step 3: Commit**

```powershell
git add tsconfig.json
git commit -m "chore: enable strict TypeScript with noUncheckedIndexedAccess"
```

---

## Task 3: Configure Tailwind CSS + Design Tokens

**Files:**
- Modify: `d:\WhatsApp-Automation\tailwind.config.ts`
- Modify: `d:\WhatsApp-Automation\app\globals.css`
- Create: `d:\WhatsApp-Automation\postcss.config.mjs` (if not created by Next)

- [ ] **Step 1: Write tailwind.config.ts with brand colors and design tokens**

Write `d:\WhatsApp-Automation\tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        surface: {
          primary:   'hsl(var(--surface-primary))',
          secondary: 'hsl(var(--surface-secondary))',
          elevated:  'hsl(var(--surface-elevated))',
        },
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        'display-xl': ['3rem',    { fontWeight: '800', lineHeight: '1.1' }],
        'display-lg': ['2.25rem', { fontWeight: '700', lineHeight: '1.2' }],
        'heading-lg': ['1.5rem',  { fontWeight: '600', lineHeight: '1.3' }],
        'heading-md': ['1.125rem',{ fontWeight: '600', lineHeight: '1.4' }],
        'body-lg':    ['1rem',    { fontWeight: '400', lineHeight: '1.6' }],
        'body-md':    ['0.875rem',{ fontWeight: '400', lineHeight: '1.5' }],
        'label':      ['0.75rem', { fontWeight: '500', lineHeight: '1.4' }],
        'caption':    ['0.6875rem',{ fontWeight: '400', lineHeight: '1.3' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
      },
      animation: {
        'accordion-down':  'accordion-down 0.2s ease-out',
        'accordion-up':    'accordion-up 0.2s ease-out',
        'fade-in':         'fade-in 0.3s ease-out',
        'slide-in-right':  'slide-in-right 0.3s cubic-bezier(0.25,0.1,0.25,1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

- [ ] **Step 2: Install tailwindcss-animate plugin**

```powershell
npm install tailwindcss-animate
```

- [ ] **Step 3: Write globals.css with CSS custom properties (light + dark)**

Write `d:\WhatsApp-Automation\app\globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Brand surface tokens */
    --surface-primary:   0 0% 100%;
    --surface-secondary: 210 40% 98%;
    --surface-elevated:  0 0% 100%;

    /* shadcn/ui semantic tokens */
    --background:         0 0% 100%;
    --foreground:         222.2 84% 4.9%;
    --card:               0 0% 100%;
    --card-foreground:    222.2 84% 4.9%;
    --popover:            0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary:            199 89% 48%;
    --primary-foreground: 210 40% 98%;
    --secondary:          210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted:              210 40% 96.1%;
    --muted-foreground:   215.4 16.3% 46.9%;
    --accent:             210 40% 96.1%;
    --accent-foreground:  222.2 47.4% 11.2%;
    --destructive:        0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border:             214.3 31.8% 91.4%;
    --input:              214.3 31.8% 91.4%;
    --ring:               199 89% 48%;
    --radius:             0.5rem;
  }

  .dark {
    --surface-primary:    222.2 84% 4.9%;
    --surface-secondary:  217.2 32.6% 10%;
    --surface-elevated:   217.2 32.6% 13%;

    --background:         222.2 84% 4.9%;
    --foreground:         210 40% 98%;
    --card:               222.2 84% 4.9%;
    --card-foreground:    210 40% 98%;
    --popover:            222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary:            199 89% 48%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary:          217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted:              217.2 32.6% 17.5%;
    --muted-foreground:   215 20.2% 65.1%;
    --accent:             217.2 32.6% 17.5%;
    --accent-foreground:  210 40% 98%;
    --destructive:        0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border:             217.2 32.6% 17.5%;
    --input:              217.2 32.6% 17.5%;
    --ring:               199 89% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "rlig" 1, "calt" 1;
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  ::-webkit-scrollbar-track {
    @apply bg-transparent;
  }

  ::-webkit-scrollbar-thumb {
    @apply bg-border rounded-full;
  }

  ::-webkit-scrollbar-thumb:hover {
    @apply bg-muted-foreground/30;
  }
}
```

- [ ] **Step 4: Verify Tailwind compiles**

```powershell
npm run build 2>&1 | Select-String "error|Error" | head -20
```

Expected: No Tailwind-related errors.

- [ ] **Step 5: Commit**

```powershell
git add tailwind.config.ts app/globals.css postcss.config.mjs
git commit -m "feat: configure Tailwind with brand design tokens and dark mode CSS vars"
```

---

## Task 4: Install and Configure shadcn/ui

**Files:**
- Create: `d:\WhatsApp-Automation\components.json`
- Create: `d:\WhatsApp-Automation\components\ui\` (generated by shadcn CLI)
- Create: `d:\WhatsApp-Automation\lib\utils.ts`

- [ ] **Step 1: Initialize shadcn/ui**

```powershell
cd "d:\WhatsApp-Automation"
npx shadcn@latest init --defaults --yes
```

When prompted (if not using --yes):
- Style: Default
- Base color: Slate
- CSS variables: Yes

- [ ] **Step 2: Verify components.json was created**

```powershell
Get-Content "d:\WhatsApp-Automation\components.json"
```

Expected: JSON with `style: "default"`, `tailwind.config: "tailwind.config.ts"`, `aliases.components: "@/components"`.

- [ ] **Step 3: Verify lib/utils.ts was created with cn helper**

```powershell
Get-Content "d:\WhatsApp-Automation\lib\utils.ts"
```

Expected output:
```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

If not present, write it manually:

Write `d:\WhatsApp-Automation\lib\utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Install core shadcn components used throughout the app**

```powershell
npx shadcn@latest add button card badge avatar dialog sheet `
  dropdown-menu popover tooltip command separator `
  input textarea label select checkbox switch `
  scroll-area skeleton tabs table progress `
  alert toast form --yes
```

- [ ] **Step 5: Verify components were generated**

```powershell
Get-ChildItem "d:\WhatsApp-Automation\components\ui" | Select-Object Name
```

Expected: 20+ component files.

- [ ] **Step 6: Commit**

```powershell
git add components/ components.json lib/utils.ts
git commit -m "feat: install shadcn/ui with core component set"
```

---

## Task 5: Configure Next.js

**Files:**
- Modify: `d:\WhatsApp-Automation\next.config.ts`

- [ ] **Step 1: Write next.config.ts with security headers and image domains**

Write `d:\WhatsApp-Automation\next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'Referrer-Policy',          value: 'origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com https://api.openai.com",
    ].join('; '),
  },
];

const config: NextConfig = {
  experimental: {
    typedRoutes: true,
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
    ];
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ];
  },

  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'framer-motion': 'framer-motion',
    };
    return config;
  },
};

export default config;
```

- [ ] **Step 2: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0 or only warnings (no errors).

- [ ] **Step 3: Commit**

```powershell
git add next.config.ts
git commit -m "chore: configure Next.js with security headers, image domains, and typed routes"
```

---

## Task 6: Set Up Supabase Clients (SSR Architecture)

**Files:**
- Create: `d:\WhatsApp-Automation\services\supabase\client.ts`
- Create: `d:\WhatsApp-Automation\services\supabase\server.ts`
- Create: `d:\WhatsApp-Automation\services\supabase\middleware.ts`

- [ ] **Step 1: Create browser Supabase client**

Write `d:\WhatsApp-Automation\services\supabase\client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server Supabase client (cookie-aware)**

Write `d:\WhatsApp-Automation\services\supabase\server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — session refresh handled by middleware
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create middleware session refresh helper**

Write `d:\WhatsApp-Automation\services\supabase\middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database.types';

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called before any auth checks
  await supabase.auth.getUser();

  return supabaseResponse;
}
```

- [ ] **Step 4: Run type check to catch any import errors**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Errors only about `@/types/database.types` not found — fixed in next task.

- [ ] **Step 5: Commit**

```powershell
git add services/
git commit -m "feat: add Supabase SSR client, server, and middleware session helper"
```

---

## Task 7: Create TypeScript Type Definitions

**Files:**
- Create: `d:\WhatsApp-Automation\types\database.types.ts`
- Create: `d:\WhatsApp-Automation\types\api.types.ts`
- Create: `d:\WhatsApp-Automation\types\auth.types.ts`

- [ ] **Step 1: Create database.types.ts placeholder (Supabase codegen fills this in Phase 3)**

Write `d:\WhatsApp-Automation\types\database.types.ts`:

```typescript
// Generated by Supabase CLI in Phase 3.
// Run: supabase gen types typescript --project-id $PROJECT_ID > types/database.types.ts
// Until then this placeholder keeps TypeScript happy.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
```

- [ ] **Step 2: Create API response envelope types**

Write `d:\WhatsApp-Automation\types\api.types.ts`:

```typescript
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}
```

- [ ] **Step 3: Create auth and role types**

Write `d:\WhatsApp-Automation\types\auth.types.ts`:

```typescript
export type UserRole = 'super_admin' | 'admin' | 'manager' | 'agent';

export type Permission =
  | 'manage_workspace'
  | 'manage_team'
  | 'create_campaigns'
  | 'view_analytics'
  | 'manage_templates'
  | 'handle_conversations'
  | 'manage_contacts'
  | 'manage_leads'
  | 'view_all_conversations'
  | 'billing_management';

export interface JWTClaims {
  sub: string;
  email: string;
  workspace_id: string;
  role: UserRole;
  permissions: Permission[];
  workspace_slug: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
    'manage_templates', 'handle_conversations', 'manage_contacts', 'manage_leads',
    'view_all_conversations', 'billing_management',
  ],
  admin: [
    'manage_workspace', 'manage_team', 'create_campaigns', 'view_analytics',
    'manage_templates', 'handle_conversations', 'manage_contacts', 'manage_leads',
    'view_all_conversations', 'billing_management',
  ],
  manager: [
    'manage_team', 'create_campaigns', 'view_analytics', 'manage_templates',
    'handle_conversations', 'manage_contacts', 'manage_leads', 'view_all_conversations',
  ],
  agent: [
    'handle_conversations', 'manage_contacts', 'manage_leads',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
```

- [ ] **Step 4: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0, no errors.

- [ ] **Step 5: Commit**

```powershell
git add types/
git commit -m "feat: add TypeScript types for database, API envelope, auth roles, and permissions"
```

---

## Task 8: Create Global Providers and Root Layout

**Files:**
- Create: `d:\WhatsApp-Automation\app\providers.tsx`
- Modify: `d:\WhatsApp-Automation\app\layout.tsx`

- [ ] **Step 1: Write providers.tsx (QueryClient + Toaster)**

Write `d:\WhatsApp-Automation\app\providers.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,          // 1 minute
            gcTime:    5 * 60 * 1000,       // 5 minutes
            retry:     1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:       'bg-surface-elevated border border-border text-foreground shadow-lg',
            title:       'text-foreground font-medium text-body-md',
            description: 'text-muted-foreground text-label',
            error:       'border-destructive/20',
            success:     'border-brand-500/20',
          },
        }}
      />
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Write root layout.tsx**

Write `d:\WhatsApp-Automation\app\layout.tsx`:

```typescript
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
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
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
  width: 'device-width',
  initialScale: 1,
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
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0.

- [ ] **Step 4: Run dev server to verify boot**

```powershell
$job = Start-Job { cd "d:\WhatsApp-Automation"; npm run dev }
Start-Sleep -Seconds 12
Receive-Job $job | Select-String "ready|error|Error" | head -10
Stop-Job $job; Remove-Job $job
```

Expected: `✓ Ready in Xms` with no fatal errors.

- [ ] **Step 5: Commit**

```powershell
git add app/providers.tsx app/layout.tsx
git commit -m "feat: add global Providers (QueryClient, Toaster) and root layout"
```

---

## Task 9: Create Auth Middleware

**Files:**
- Create: `d:\WhatsApp-Automation\middleware.ts`

- [ ] **Step 1: Write middleware.ts with auth guard and role-based route protection**

Write `d:\WhatsApp-Automation\middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/services/supabase/middleware';

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/verify-email'];

const ROLE_PROTECTED_ROUTES: Array<{ path: string; allowedRoles: string[] }> = [
  { path: '/settings/billing', allowedRoles: ['super_admin', 'admin'] },
  { path: '/analytics',        allowedRoles: ['super_admin', 'admin', 'manager'] },
  { path: '/campaigns',        allowedRoles: ['super_admin', 'admin', 'manager'] },
  { path: '/team',             allowedRoles: ['super_admin', 'admin', 'manager'] },
];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Always allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Refresh session and validate auth
  const response = await updateSession(request);

  // Check role-based route restrictions
  // Role enforcement happens after session refresh — claims will be in cookie
  const roleHeader = request.cookies.get('agentix-role')?.value;
  if (roleHeader) {
    const restricted = ROLE_PROTECTED_ROUTES.find((r) =>
      pathname.startsWith(r.path)
    );
    if (restricted && !restricted.allowedRoles.includes(roleHeader)) {
      return NextResponse.redirect(new URL('/conversations', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 2: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0.

- [ ] **Step 3: Commit**

```powershell
git add middleware.ts
git commit -m "feat: add auth middleware with public route bypass and role-based guards"
```

---

## Task 10: Create Folder Scaffold and Placeholder Pages

**Files:**
- Create all module, store, hook, animation, realtime directories with placeholder files

- [ ] **Step 1: Create the full folder scaffold**

```powershell
$dirs = @(
  "modules\auth\components",
  "modules\auth\hooks",
  "modules\auth\services",
  "modules\auth\types",
  "modules\conversations\components",
  "modules\conversations\hooks",
  "modules\conversations\services",
  "modules\conversations\types",
  "modules\crm\components",
  "modules\crm\hooks",
  "modules\crm\services",
  "modules\crm\types",
  "modules\campaigns\components",
  "modules\campaigns\hooks",
  "modules\campaigns\services",
  "modules\campaigns\types",
  "modules\contacts\components",
  "modules\contacts\hooks",
  "modules\contacts\services",
  "modules\contacts\types",
  "modules\templates\components",
  "modules\templates\hooks",
  "modules\templates\services",
  "modules\templates\types",
  "modules\team\components",
  "modules\team\hooks",
  "modules\team\services",
  "modules\team\types",
  "modules\analytics\components",
  "modules\analytics\hooks",
  "modules\analytics\services",
  "modules\analytics\types",
  "modules\notifications\components",
  "modules\notifications\hooks",
  "modules\notifications\services",
  "modules\notifications\types",
  "modules\settings\components",
  "modules\settings\hooks",
  "modules\settings\services",
  "modules\settings\types",
  "components\common\Avatar",
  "components\common\Badge",
  "components\common\DataTable",
  "components\common\EmptyState",
  "components\common\ErrorBoundary",
  "components\common\LoadingSpinner",
  "components\common\PageHeader",
  "components\common\SearchInput",
  "components\common\SkeletonLoader",
  "components\layout\AppShell",
  "components\layout\Sidebar",
  "components\layout\TopBar",
  "components\layout\MobileNav",
  "components\layout\CommandPalette",
  "components\charts\AreaChart",
  "components\charts\BarChart",
  "components\charts\DonutChart",
  "components\charts\MetricCard",
  "services\whatsapp",
  "services\ai",
  "services\queue",
  "database\migrations",
  "database\seeds",
  "database\policies",
  "supabase\functions\process-campaign",
  "supabase\functions\whatsapp-webhook",
  "supabase\functions\ai-agent",
  "supabase\functions\send-notification"
)

foreach ($dir in $dirs) {
  New-Item -ItemType Directory -Force "d:\WhatsApp-Automation\$dir" | Out-Null
}

Write-Host "All directories created."
```

- [ ] **Step 2: Create placeholder auth pages**

Write `d:\WhatsApp-Automation\app\(auth)\login\page.tsx`:

```typescript
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary">
      <div className="text-center">
        <h1 className="text-heading-lg text-foreground">Agentix</h1>
        <p className="mt-2 text-body-md text-muted-foreground">
          Login — Phase 2 implementation
        </p>
      </div>
    </div>
  );
}
```

Write `d:\WhatsApp-Automation\app\(auth)\signup\page.tsx`:

```typescript
export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary">
      <div className="text-center">
        <h1 className="text-heading-lg text-foreground">Create Account</h1>
        <p className="mt-2 text-body-md text-muted-foreground">
          Signup — Phase 2 implementation
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder dashboard route group**

Write `d:\WhatsApp-Automation\app\(dashboard)\layout.tsx`:

```typescript
interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-secondary">
      {/* Sidebar — Phase 4 */}
      <aside className="w-64 shrink-0 border-r border-border bg-surface-primary" />
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

Write `d:\WhatsApp-Automation\app\(dashboard)\page.tsx`:

```typescript
export default function DashboardPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground text-body-md">
        Dashboard — Phase 4 implementation
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Commit the full scaffold**

```powershell
git add .
git commit -m "feat: create full folder scaffold with placeholder auth and dashboard pages"
```

---

## Task 11: Create Zustand Stores (Wiring Only)

**Files:**
- Create: `d:\WhatsApp-Automation\store\auth.store.ts`
- Create: `d:\WhatsApp-Automation\store\workspace.store.ts`
- Create: `d:\WhatsApp-Automation\store\conversation.store.ts`
- Create: `d:\WhatsApp-Automation\store\notification.store.ts`
- Create: `d:\WhatsApp-Automation\store\ui.store.ts`

- [ ] **Step 1: Write auth.store.ts**

Write `d:\WhatsApp-Automation\store\auth.store.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { JWTClaims, UserRole, Permission } from '@/types/auth.types';
import { hasPermission } from '@/types/auth.types';

interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
}

interface AuthState {
  user: User | null;
  claims: JWTClaims | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setUser: (user: User | null) => void;
  setClaims: (claims: JWTClaims | null) => void;
  setLoading: (loading: boolean) => void;
  can: (permission: Permission) => boolean;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      user:            null,
      claims:          null,
      isLoading:       true,
      isAuthenticated: false,

      setUser: (user) =>
        set({ user, isAuthenticated: user !== null }, false, 'auth/setUser'),

      setClaims: (claims) =>
        set({ claims }, false, 'auth/setClaims'),

      setLoading: (isLoading) =>
        set({ isLoading }, false, 'auth/setLoading'),

      can: (permission: Permission): boolean => {
        const { claims } = get();
        if (!claims) return false;
        return hasPermission(claims.role as UserRole, permission);
      },

      reset: () =>
        set(
          { user: null, claims: null, isAuthenticated: false, isLoading: false },
          false,
          'auth/reset'
        ),
    }),
    { name: 'AuthStore' }
  )
);
```

- [ ] **Step 2: Write workspace.store.ts**

Write `d:\WhatsApp-Automation\store\workspace.store.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  waba_id: string | null;
  phone_number_id: string | null;
}

interface WorkspaceMember {
  id: string;
  user_id: string;
  role: string;
  is_online: boolean;
}

interface WorkspaceState {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  members: WorkspaceMember[];
  onlineAgentIds: Set<string>;

  setActiveWorkspace: (workspace: Workspace | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setMembers: (members: WorkspaceMember[]) => void;
  setAgentOnline: (agentId: string, online: boolean) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    (set) => ({
      activeWorkspace: null,
      workspaces:      [],
      members:         [],
      onlineAgentIds:  new Set(),

      setActiveWorkspace: (workspace) =>
        set({ activeWorkspace: workspace }, false, 'workspace/setActive'),

      setWorkspaces: (workspaces) =>
        set({ workspaces }, false, 'workspace/setAll'),

      setMembers: (members) =>
        set({ members }, false, 'workspace/setMembers'),

      setAgentOnline: (agentId, online) =>
        set(
          (state) => {
            const next = new Set(state.onlineAgentIds);
            if (online) next.add(agentId);
            else next.delete(agentId);
            return { onlineAgentIds: next };
          },
          false,
          'workspace/setAgentOnline'
        ),

      reset: () =>
        set(
          { activeWorkspace: null, workspaces: [], members: [], onlineAgentIds: new Set() },
          false,
          'workspace/reset'
        ),
    }),
    { name: 'WorkspaceStore' }
  )
);
```

- [ ] **Step 3: Write conversation.store.ts**

Write `d:\WhatsApp-Automation\store\conversation.store.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface TypingUser {
  user_id: string;
  conversation_id: string;
}

interface ConversationState {
  activeConversationId: string | null;
  typingUsers: TypingUser[];
  replyToMessageId: string | null;

  setActiveConversation: (id: string | null) => void;
  setTyping: (userId: string, conversationId: string, isTyping: boolean) => void;
  setReplyTo: (messageId: string | null) => void;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>()(
  devtools(
    (set) => ({
      activeConversationId: null,
      typingUsers:          [],
      replyToMessageId:     null,

      setActiveConversation: (id) =>
        set({ activeConversationId: id }, false, 'conversation/setActive'),

      setTyping: (userId, conversationId, isTyping) =>
        set(
          (state) => ({
            typingUsers: isTyping
              ? [...state.typingUsers.filter((t) => t.user_id !== userId), { user_id: userId, conversation_id: conversationId }]
              : state.typingUsers.filter((t) => t.user_id !== userId),
          }),
          false,
          'conversation/setTyping'
        ),

      setReplyTo: (messageId) =>
        set({ replyToMessageId: messageId }, false, 'conversation/setReplyTo'),

      reset: () =>
        set(
          { activeConversationId: null, typingUsers: [], replyToMessageId: null },
          false,
          'conversation/reset'
        ),
    }),
    { name: 'ConversationStore' }
  )
);
```

- [ ] **Step 4: Write notification.store.ts**

Write `d:\WhatsApp-Automation\store\notification.store.ts`:

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface NotificationState {
  unreadCount: number;
  soundEnabled: boolean;

  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;
  toggleSound: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    persist(
      (set) => ({
        unreadCount:  0,
        soundEnabled: true,

        setUnreadCount:  (count) => set({ unreadCount: count }, false, 'notifications/setCount'),
        incrementUnread: ()      => set((s) => ({ unreadCount: s.unreadCount + 1 }), false, 'notifications/increment'),
        clearUnread:     ()      => set({ unreadCount: 0 }, false, 'notifications/clear'),
        toggleSound:     ()      => set((s) => ({ soundEnabled: !s.soundEnabled }), false, 'notifications/toggleSound'),
      }),
      { name: 'agentix-notifications' }
    ),
    { name: 'NotificationStore' }
  )
);
```

- [ ] **Step 5: Write ui.store.ts**

Write `d:\WhatsApp-Automation\store\ui.store.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

type ModalId = 'newConversation' | 'newContact' | 'newCampaign' | 'newLead' | 'mediaPreview' | null;

interface UIState {
  sidebarCollapsed: boolean;
  activeModal: ModalId;
  commandPaletteOpen: boolean;
  theme: 'light' | 'dark' | 'system';

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (modal: ModalId) => void;
  closeModal: () => void;
  toggleCommandPalette: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      sidebarCollapsed:   false,
      activeModal:        null,
      commandPaletteOpen: false,
      theme:              'system',

      toggleSidebar:      () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }), false, 'ui/toggleSidebar'),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }, false, 'ui/setSidebar'),
      openModal:           (modal) => set({ activeModal: modal }, false, 'ui/openModal'),
      closeModal:          () => set({ activeModal: null }, false, 'ui/closeModal'),
      toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen }), false, 'ui/togglePalette'),
      setTheme:            (theme) => set({ theme }, false, 'ui/setTheme'),
    }),
    { name: 'UIStore' }
  )
);
```

- [ ] **Step 6: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0, no errors.

- [ ] **Step 7: Commit**

```powershell
git add store/
git commit -m "feat: add Zustand stores for auth, workspace, conversation, notifications, and UI"
```

---

## Task 12: Create Shared Hooks

**Files:**
- Create: `d:\WhatsApp-Automation\hooks\useAuth.ts`
- Create: `d:\WhatsApp-Automation\hooks\useWorkspace.ts`
- Create: `d:\WhatsApp-Automation\hooks\useDebounce.ts`

- [ ] **Step 1: Write useAuth.ts**

Write `d:\WhatsApp-Automation\hooks\useAuth.ts`:

```typescript
'use client';

import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { useAuthStore } from '@/store/auth.store';

export function useAuth() {
  const store = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        store.setUser({
          id:         data.user.id,
          email:      data.user.email ?? '',
          full_name:  (data.user.user_metadata['full_name'] as string | undefined) ?? '',
          avatar_url: (data.user.user_metadata['avatar_url'] as string | undefined) ?? null,
        });
      }
      store.setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        store.setUser({
          id:         session.user.id,
          email:      session.user.email ?? '',
          full_name:  (session.user.user_metadata['full_name'] as string | undefined) ?? '',
          avatar_url: (session.user.user_metadata['avatar_url'] as string | undefined) ?? null,
        });
      } else {
        store.reset();
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    user:            store.user,
    isLoading:       store.isLoading,
    isAuthenticated: store.isAuthenticated,
    can:             store.can,
  };
}
```

- [ ] **Step 2: Write useWorkspace.ts**

Write `d:\WhatsApp-Automation\hooks\useWorkspace.ts`:

```typescript
'use client';

import { useWorkspaceStore } from '@/store/workspace.store';

export function useWorkspace() {
  const { activeWorkspace, workspaces, members, onlineAgentIds } = useWorkspaceStore();

  return {
    workspace:     activeWorkspace,
    workspaces,
    members,
    onlineAgentIds,
    isConfigured:  Boolean(activeWorkspace?.waba_id && activeWorkspace.phone_number_id),
  };
}
```

- [ ] **Step 3: Write useDebounce.ts**

Write `d:\WhatsApp-Automation\hooks\useDebounce.ts`:

```typescript
'use client';

import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

- [ ] **Step 4: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0.

- [ ] **Step 5: Commit**

```powershell
git add hooks/
git commit -m "feat: add useAuth, useWorkspace, useDebounce hooks"
```

---

## Task 13: Create Animation Variants

**Files:**
- Create: `d:\WhatsApp-Automation\animations\page.animations.ts`
- Create: `d:\WhatsApp-Automation\animations\list.animations.ts`
- Create: `d:\WhatsApp-Automation\animations\modal.animations.ts`

- [ ] **Step 1: Write page.animations.ts**

Write `d:\WhatsApp-Automation\animations\page.animations.ts`:

```typescript
import type { Variants } from 'framer-motion';

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};
```

- [ ] **Step 2: Write list.animations.ts**

Write `d:\WhatsApp-Automation\animations\list.animations.ts`:

```typescript
import type { Variants } from 'framer-motion';

export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

export const messageAppear: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2 } },
};
```

- [ ] **Step 3: Write modal.animations.ts**

Write `d:\WhatsApp-Automation\animations\modal.animations.ts`:

```typescript
import type { Variants } from 'framer-motion';

export const slideInFromRight: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', damping: 25, stiffness: 300 },
  },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

export const overlayFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};
```

- [ ] **Step 4: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0.

- [ ] **Step 5: Commit**

```powershell
git add animations/
git commit -m "feat: add Framer Motion animation variants for pages, lists, and modals"
```

---

## Task 14: Create Realtime Channel Definitions

**Files:**
- Create: `d:\WhatsApp-Automation\realtime\channels.ts`
- Create: `d:\WhatsApp-Automation\realtime\subscriptions.ts`

- [ ] **Step 1: Write channels.ts**

Write `d:\WhatsApp-Automation\realtime\channels.ts`:

```typescript
export const REALTIME_CHANNELS = {
  WORKSPACE:      (wsId: string)   => `workspace:${wsId}`,
  CONVERSATION:   (convId: string) => `conversation:${convId}`,
  AGENT_PRESENCE: (wsId: string)   => `presence:agents:${wsId}`,
  NOTIFICATIONS:  (userId: string) => `notifications:${userId}`,
  CAMPAIGN:       (campId: string) => `campaign:${campId}`,
} as const;

export type RealtimeChannelName = ReturnType<typeof REALTIME_CHANNELS[keyof typeof REALTIME_CHANNELS]>;
```

- [ ] **Step 2: Write subscriptions.ts**

Write `d:\WhatsApp-Automation\realtime\subscriptions.ts`:

```typescript
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

const activeChannels = new Map<string, RealtimeChannel>();

export function getOrCreateChannel(client: Client, name: string): RealtimeChannel {
  const existing = activeChannels.get(name);
  if (existing) return existing;

  const channel = client.channel(name);
  activeChannels.set(name, channel);
  return channel;
}

export function removeChannel(client: Client, name: string): void {
  const channel = activeChannels.get(name);
  if (channel) {
    client.removeChannel(channel);
    activeChannels.delete(name);
  }
}

export function removeAllChannels(client: Client): void {
  for (const [name] of activeChannels) {
    removeChannel(client, name);
  }
}
```

- [ ] **Step 3: Run type check**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: Exit 0.

- [ ] **Step 4: Commit**

```powershell
git add realtime/
git commit -m "feat: add Supabase Realtime channel registry with dedup and cleanup"
```

---

## Task 15: Environment Configuration

**Files:**
- Create: `d:\WhatsApp-Automation\.env.local.example`
- Create: `d:\WhatsApp-Automation\.env.local`

- [ ] **Step 1: Write .env.local.example**

Write `d:\WhatsApp-Automation\.env.local.example`:

```bash
# ─── Supabase ───────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ─── WhatsApp Business API ──────────────────────
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_WABA_ID=your-waba-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret
META_APP_SECRET=your-app-secret

# ─── AI (OpenAI) ────────────────────────────────
OPENAI_API_KEY=sk-your-openai-key

# ─── Queue (Upstash Redis) ──────────────────────
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# ─── Monitoring ─────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
AXIOM_TOKEN=your-axiom-token
AXIOM_DATASET=agentix-prod

# ─── App ────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
CRON_SECRET=your-cron-secret
```

- [ ] **Step 2: Write .env.local (with placeholder values for dev)**

Write `d:\WhatsApp-Automation\.env.local`:

```bash
# ─── Supabase ───────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key

# ─── WhatsApp Business API ──────────────────────
WHATSAPP_PHONE_NUMBER_ID=placeholder
WHATSAPP_WABA_ID=placeholder
WHATSAPP_ACCESS_TOKEN=placeholder
WHATSAPP_WEBHOOK_SECRET=placeholder-secret
META_APP_SECRET=placeholder-secret

# ─── AI ─────────────────────────────────────────
OPENAI_API_KEY=sk-placeholder

# ─── Queue ──────────────────────────────────────
UPSTASH_REDIS_REST_URL=placeholder
UPSTASH_REDIS_REST_TOKEN=placeholder

# ─── App ────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-production
CRON_SECRET=dev-cron-secret
```

- [ ] **Step 3: Ensure .env.local is gitignored**

```powershell
$gitignore = Get-Content "d:\WhatsApp-Automation\.gitignore" -Raw
if (-not $gitignore.Contains(".env.local")) {
  Add-Content "d:\WhatsApp-Automation\.gitignore" "`n.env.local`n.env.*.local`n"
  Write-Host ".env.local added to .gitignore"
} else {
  Write-Host ".env.local already in .gitignore"
}
```

- [ ] **Step 4: Commit example file only**

```powershell
git add .env.local.example .gitignore
git commit -m "chore: add .env.local.example with all required environment variables"
```

---

## Task 16: Verify Full Build

- [ ] **Step 1: Run full type check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: Exit 0, zero errors.

- [ ] **Step 2: Run ESLint**

```powershell
npx next lint 2>&1 | head -40
```

Expected: `✓ No ESLint warnings or errors` (or minor warnings only).

- [ ] **Step 3: Run production build**

```powershell
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with route listing showing `(auth)` and `(dashboard)` groups.

- [ ] **Step 4: Verify dev server boots cleanly**

```powershell
$job = Start-Job { cd "d:\WhatsApp-Automation"; npm run dev 2>&1 }
Start-Sleep -Seconds 15
Receive-Job $job | Select-String "ready|error|Error|✓"
Stop-Job $job; Remove-Job $job
```

Expected: `✓ Ready in XXms`

- [ ] **Step 5: Final commit**

```powershell
git add .
git commit -m "chore: Phase 1 complete — project foundation verified, all checks passing"
```

---

## Spec Coverage Check

| Spec Section | Covered | Task |
|---|---|---|
| Next.js 15 App Router | ✅ | Task 1 |
| TypeScript strict mode | ✅ | Task 2 |
| Tailwind CSS 3.4+ with brand tokens | ✅ | Task 3 |
| shadcn/ui with core components | ✅ | Task 4 |
| Security headers (CSP, X-Frame) | ✅ | Task 5 |
| Supabase browser client | ✅ | Task 6 |
| Supabase server client (SSR) | ✅ | Task 6 |
| Supabase middleware session refresh | ✅ | Task 6 |
| TypeScript database types | ✅ | Task 7 |
| API response envelope types | ✅ | Task 7 |
| Auth roles and permissions | ✅ | Task 7 |
| TanStack Query (QueryClient) | ✅ | Task 8 |
| Sonner Toaster | ✅ | Task 8 |
| Root layout with Inter font | ✅ | Task 8 |
| Middleware with route guards | ✅ | Task 9 |
| Full folder structure from blueprint | ✅ | Task 10 |
| Auth/Dashboard route groups | ✅ | Task 10 |
| Zustand: auth, workspace, conversation, notification, ui stores | ✅ | Task 11 |
| useAuth, useWorkspace, useDebounce hooks | ✅ | Task 12 |
| Framer Motion animation variants | ✅ | Task 13 |
| Supabase Realtime channel registry | ✅ | Task 14 |
| Environment configuration (.env.local.example) | ✅ | Task 15 |
| All blueprint dependencies installed | ✅ | Task 1 |

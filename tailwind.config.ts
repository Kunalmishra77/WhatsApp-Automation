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
        /* ── AGENTiX brand orange ──────────────────────── */
        brand: {
          50:  '#fff6f2',
          100: '#ffe8db',
          200: '#ffd0b7',
          300: '#ffaf8a',
          400: '#ff7f4d',
          500: '#e8622a',   /* primary orange from logo */
          600: '#cc4a14',
          700: '#a33a0e',
          800: '#852f0f',
          900: '#6e2810',
          950: '#3b1206',
        },
        /* ── AGENTiX dark navy ─────────────────────────── */
        navy: {
          50:  '#f0f4f9',
          100: '#d9e2f0',
          200: '#b3c5e0',
          300: '#7d9dc8',
          400: '#4a76af',
          500: '#2d5896',
          600: '#1f4279',
          700: '#163261',
          800: '#1a2b4a',   /* navy from logo */
          900: '#0f1e38',
          950: '#08111f',
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
        'display-xl': ['3rem',     { fontWeight: '800', lineHeight: '1.1' }],
        'display-lg': ['2.25rem',  { fontWeight: '700', lineHeight: '1.2' }],
        'heading-lg': ['1.5rem',   { fontWeight: '600', lineHeight: '1.3' }],
        'heading-md': ['1.125rem', { fontWeight: '600', lineHeight: '1.4' }],
        'body-lg':    ['1rem',     { fontWeight: '400', lineHeight: '1.6' }],
        'body-md':    ['0.875rem', { fontWeight: '400', lineHeight: '1.5' }],
        'label':      ['0.75rem',  { fontWeight: '500', lineHeight: '1.4' }],
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
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':        'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.25,0.1,0.25,1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

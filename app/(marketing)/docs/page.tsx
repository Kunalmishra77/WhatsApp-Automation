import type { Metadata } from 'next';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  CreditCard,
  Inbox,
  KanbanSquare,
  Megaphone,
  MessageSquare,
  Settings2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Section } from '@/modules/marketing/components/Section';
import { Eyebrow } from '@/modules/marketing/components/Eyebrow';
import { DisplayHeading } from '@/modules/marketing/components/DisplayHeading';
import { FeatureCard } from '@/modules/marketing/components/FeatureCard';
import { CTABand } from '@/modules/marketing/components/CTABand';

export const metadata: Metadata = {
  title: 'Docs & Help',
  description:
    'Get set up with AGENTiX — creating your account, connecting WhatsApp, building your AI agent\'s knowledge base, running campaigns, the CRM pipeline, and billing.',
};

interface DocTopic {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

interface DocCategory {
  title: string;
  topics: DocTopic[];
}

const CATEGORIES: DocCategory[] = [
  {
    title: 'Getting started',
    topics: [
      {
        href: '/signup',
        icon: UserPlus,
        title: 'Create your account',
        description: 'Sign up free, no card required, and land straight in your new workspace.',
      },
      {
        href: '/features/whatsapp-automation',
        icon: MessageSquare,
        title: 'Connect WhatsApp',
        description: 'Link your existing WhatsApp Business number through the official API, or migrate one in.',
      },
      {
        href: '/features/ai-agent',
        icon: BookOpen,
        title: "Set up your AI agent's knowledge base",
        description: 'Upload your services, pricing, and policies so the agent answers accurately from day one.',
      },
      {
        href: '/signup',
        icon: Users,
        title: 'Invite your team',
        description: 'Add teammates to your workspace so conversations can be assigned and shared.',
      },
    ],
  },
  {
    title: 'Using AGENTiX',
    topics: [
      {
        href: '/features/shared-inbox',
        icon: Inbox,
        title: 'Shared inbox basics',
        description: 'WhatsApp and Instagram DMs in one inbox — assignment, internal notes, and labels.',
      },
      {
        href: '/features/campaigns',
        icon: Megaphone,
        title: 'Building campaigns',
        description: 'Send template broadcasts to a segmented audience and track delivery, reads, and replies.',
      },
      {
        href: '/features/crm',
        icon: KanbanSquare,
        title: 'The CRM pipeline',
        description: 'Understand how leads are automatically scored Hot, Warm, or Cold as they move through the Kanban board.',
      },
      {
        href: '/features/analytics',
        icon: BarChart3,
        title: 'Reading your analytics',
        description: 'One dashboard for conversations, campaigns, leads, and revenue — with CSV export.',
      },
    ],
  },
  {
    title: 'Billing',
    topics: [
      {
        href: '/pricing',
        icon: CreditCard,
        title: 'Plans & GST',
        description: 'See the full price breakdown by term, including 18% GST and the Instagram add-on.',
      },
      {
        href: '/contact',
        icon: Settings2,
        title: 'Managing your subscription',
        description: 'Change your term, add a channel, or cancel — our team handles it over email.',
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section variant="navy" className="relative -mt-16 overflow-hidden pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Eyebrow>Docs</Eyebrow>
          <DisplayHeading as="h1" className="mx-auto text-white">
            Everything you need to get set up.
          </DisplayHeading>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            Short answers for connecting WhatsApp, training your AI agent, and getting the most out of
            your inbox, CRM, and campaigns.
          </p>
        </div>
      </Section>

      {/* ── Topic categories ─────────────────────────────────────────────── */}
      {CATEGORIES.map((category, i) => (
        <Section key={category.title} variant={i % 2 === 0 ? 'warm' : 'white'}>
          <h2 className="font-display text-xl font-semibold text-navy-900 sm:text-2xl">{category.title}</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {category.topics.map((topic) => (
              <Link
                key={topic.title}
                href={topic.href}
                className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-warm"
              >
                <FeatureCard icon={topic.icon} title={topic.title} description={topic.description} />
              </Link>
            ))}
          </div>
        </Section>
      ))}

      {/* ── Can't find it ────────────────────────────────────────────────── */}
      <Section variant="warm" className="pt-0">
        <CTABand
          heading="Can't find it?"
          subcopy="Our team is a message away — reach out and we'll walk you through it directly."
          ctaLabel="Contact support"
          ctaHref="/contact"
        />
      </Section>
    </>
  );
}

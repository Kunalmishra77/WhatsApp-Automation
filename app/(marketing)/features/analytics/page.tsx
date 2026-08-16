import type { Metadata } from 'next';
import { FeaturePage, type FeaturePageSection } from '@/modules/marketing/components/FeaturePage';

export const metadata: Metadata = {
  title: 'Analytics & Reports',
  description:
    'One accurate dashboard for conversations, campaigns, leads, and revenue — with CSV export. A single source of truth, so your team stops arguing over whose numbers are right.',
};

const SECTIONS: FeaturePageSection[] = [
  {
    heading: 'One dashboard, every number that matters',
    body: "Conversations, campaign performance, lead pipeline, revenue — pulled from the same data your team is actually working in, not a spreadsheet someone updates once a week.",
    bullets: [
      'Message volume, response time, and resolution rate — updated as conversations happen.',
      'Campaign delivery, read, and reply rates sit next to the leads and revenue they generated.',
      'Pipeline health — how many leads are Hot, Warm, or Cold right now — at a glance.',
    ],
  },
  {
    heading: 'Export what you need, whenever you need it',
    body: "A dashboard is a starting point, not the finish line. Every report exports to CSV in a click, so your team can build the board deck, the finance reconciliation, or the weekly review without pinging engineering for a data pull.",
    bullets: [
      'One-click CSV export on every report — conversations, campaigns, leads, revenue.',
      'Filter by date range, channel, or team member before you export.',
      'No API calls, no waiting on a data export request — it is ready when you are.',
    ],
  },
  {
    heading: 'A single source of truth',
    body: "When the WhatsApp numbers, the CRM numbers, and the revenue numbers come from three different tools, someone is always arguing about whose report is right. AGENTiX keeps conversations, leads, and revenue in one system, so every report agrees with every other report.",
    bullets: [
      'Conversations, leads, and revenue live in the same system — no reconciling three tools.',
      'Every number on the dashboard traces back to an actual logged conversation or order.',
      'Your team reviews one number, not three conflicting ones, every Monday.',
    ],
  },
];

const STATS = [
  { value: '1', label: 'Dashboard, every number' },
  { value: 'CSV', label: 'Export in one click' },
  { value: 'Real-time', label: 'Conversations, leads & revenue' },
];

export default function AnalyticsPage() {
  return (
    <FeaturePage
      eyebrow="Analytics & Reports"
      title="Numbers your whole team can trust."
      subtitle="Conversations, campaigns, leads, and revenue in one accurate dashboard — export to CSV anytime, and stop reconciling three different tools to answer one question."
      sections={SECTIONS}
      stats={STATS}
    />
  );
}

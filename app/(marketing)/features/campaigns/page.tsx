import type { Metadata } from 'next';
import { FeaturePage, type FeaturePageSection } from '@/modules/marketing/components/FeaturePage';
import type { ConversationTurn } from '@/modules/marketing/components/ConversationThread';

export const metadata: Metadata = {
  title: 'Campaigns & Broadcasts',
  description:
    'Send WhatsApp template broadcasts to segmented audiences, track delivery/read/reply analytics, retarget cold leads, and turn click-to-WhatsApp ads into conversations — automatically handled.',
};

const HERO_CONVERSATION: ConversationTurn[] = [
  { from: 'agent', text: 'Diwali Sale is live — 20% off every package, this week only. Reply YES to lock your slot.' },
  { from: 'customer', text: 'YES, book me for Saturday' },
  { from: 'agent', text: "You're booked for Saturday, 20% off applied. See you then!" },
];

const SECTIONS: FeaturePageSection[] = [
  {
    heading: 'Reach the right segment, every time',
    body: "A blast to every contact you've ever messaged is how you get blocked, not booked. Build a broadcast around who actually matters right now — by tag, by lead temperature, by last purchase.",
    bullets: [
      'Segment by tag, Hot/Warm/Cold temperature, or last conversation date.',
      'Approved WhatsApp templates, sent from the same number customers already know.',
      'Schedule ahead for festival sales, appointment reminders, or a re-stock alert.',
    ],
  },
  {
    heading: 'Delivery, read, and reply — all tracked',
    body: "You shouldn't have to guess whether a campaign worked. Every broadcast reports sent, delivered, read, and replied — down to the individual contact — so you know what actually drove revenue.",
    bullets: [
      'Per-campaign delivery and read rates, updated in real time.',
      'Reply rate broken down by segment, so you learn which audience responds.',
      'Every reply routes straight into the shared inbox — no separate tool to check.',
    ],
  },
  {
    heading: 'Retarget without starting from zero',
    body: "Cold leads and old customers aren't dead ends — they're your cheapest next sale. Re-open a stalled conversation with a fresh offer, and the AI agent handles the reply the moment it lands.",
    conversation: [
      { from: 'customer', text: 'Saw your Diwali offer — is it still on?' },
      { from: 'agent', text: 'Yes! 20% off every package till Sunday. Want me to apply it to your booking?' },
    ],
    pipeline: ['Cold lead', 'Re-engaged'],
  },
  {
    heading: 'Click-to-WhatsApp ads that land in the same inbox',
    body: "Run a click-to-WhatsApp ad on Meta and the customer's first message drops straight into your shared inbox — pre-tagged with the campaign that brought them in, ready for the AI agent to take the first reply.",
    bullets: [
      'Every ad-originated chat is tagged, so you know exactly which campaign paid for that lead.',
      'The AI agent answers the very first message — no lag between ad click and reply.',
      'Ad spend and reply-to-lead conversion sit side by side in your reports.',
    ],
  },
];

const STATS = [
  { value: 'Segmented', label: 'By tag or lead temperature' },
  { value: 'Delivered · Read · Replied', label: 'Tracked per campaign' },
  { value: '1 click', label: 'Ad to WhatsApp conversation' },
];

export default function CampaignsPage() {
  return (
    <FeaturePage
      eyebrow="Campaigns & Broadcasts"
      title="Broadcasts that convert, not spam."
      subtitle="Send targeted WhatsApp campaigns, watch delivery/read/reply in real time, and let the AI agent handle every reply — from a first click to a repeat customer."
      heroConversation={HERO_CONVERSATION}
      sections={SECTIONS}
      stats={STATS}
    />
  );
}

import type { Metadata } from 'next';
import { FeaturePage, type FeaturePageSection } from '@/modules/marketing/components/FeaturePage';
import type { ConversationTurn } from '@/modules/marketing/components/ConversationThread';

export const metadata: Metadata = {
  title: 'WhatsApp Automation',
  description:
    'Auto-reply 24/7, share your catalog, take orders with a payment link, and send campaign broadcasts — all inside WhatsApp, powered by AGENTiX.',
};

const HERO_CONVERSATION: ConversationTurn[] = [
  { from: 'customer', text: 'Hi, do you have the Ceramic Coating package for SUVs? What is the price?' },
  {
    from: 'agent',
    text: 'Yes! Ceramic Coating for SUVs is ₹8,999, includes a 2-year warranty. Want me to check available slots this week?',
  },
];

const SECTIONS: FeaturePageSection[] = [
  {
    heading: 'Never miss a message again',
    body: 'Most inquiries land after closing time or mid-rush — and by the time someone replies, the customer has already messaged a competitor. AGENTiX answers instantly, every time, using your own business details, not a generic bot script.',
    bullets: [
      '24/7 auto-reply grounded in your actual hours, location, pricing, and policies.',
      'Handles the repetitive 80% — availability, pricing, directions — so your team steps in only where it matters.',
      'Every conversation is logged and searchable. Nothing sits unread overnight.',
    ],
  },
  {
    heading: 'Your catalog, right inside the chat',
    body: "Customers don't want to leave WhatsApp to browse a website. Share products, prices, and photos as native catalog messages, and let the AI agent field the follow-up questions on its own.",
    conversation: [
      { from: 'customer', text: 'Does this kurta set come in size M?' },
      { from: 'agent', text: 'Yes, size M is in stock — ₹1,499. Want me to reserve it and send a payment link?' },
      { from: 'customer', text: 'Yes please' },
      { from: 'agent', text: "Done — here's your payment link: pay.agentix.in/8x2k. Reserved for 30 minutes." },
    ],
  },
  {
    heading: 'Orders and payment, without switching apps',
    body: 'Once a customer says yes, the AI agent generates a payment link on the spot, confirms once it clears, and logs the order — no separate invoicing tool, no manual follow-up to check if the payment came through.',
    bullets: [
      'Payment links generated and sent mid-conversation, the moment intent is clear.',
      'Orders auto-confirmed the instant payment clears — customer and team both notified.',
      "No more \"did they actually pay?\" — every order status is tracked automatically.",
    ],
  },
  {
    heading: 'Broadcasts that bring customers back',
    body: 'Reach an entire segment — past customers, cart-abandoners, a whole city — with an approved WhatsApp template in one send, from the same number your customers already reply to.',
    bullets: [
      'Segment by tag, lead temperature, or last order date before you broadcast.',
      'Template messages that meet WhatsApp policy, sent without the manual approval scramble.',
      'Replies land back in the same inbox, and the AI agent picks up the conversation instantly.',
    ],
  },
];

const STATS = [
  { value: '24/7', label: 'Auto-reply, always on' },
  { value: '1', label: 'WhatsApp number, every feature' },
  { value: '<10s', label: 'Typical first response' },
];

export default function WhatsAppAutomationPage() {
  return (
    <FeaturePage
      eyebrow="WhatsApp Automation"
      title="Every message answered, automatically."
      subtitle="From the first hello to the paid order — AGENTiX auto-replies, shares your catalog, takes payment, and runs broadcasts, all inside the WhatsApp your customers already use."
      heroConversation={HERO_CONVERSATION}
      sections={SECTIONS}
      stats={STATS}
    />
  );
}

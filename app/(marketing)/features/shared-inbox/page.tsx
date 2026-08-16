import type { Metadata } from 'next';
import { FeaturePage, type FeaturePageSection } from '@/modules/marketing/components/FeaturePage';
import type { ConversationTurn } from '@/modules/marketing/components/ConversationThread';

export const metadata: Metadata = {
  title: 'Shared Team Inbox',
  description:
    'WhatsApp and Instagram DMs in one shared inbox — agent assignment, internal notes, labels, and full conversation history. No more juggling phones and tabs across your team.',
};

const HERO_CONVERSATION: ConversationTurn[] = [
  { from: 'customer', text: 'Hey! Saw your reel on the new skincare routine — is the serum in stock?' },
  { from: 'agent', text: "Yes, it's in stock — ₹899. Want me to share a payment link so I can pack one for you?" },
];

const SECTIONS: FeaturePageSection[] = [
  {
    heading: 'WhatsApp and Instagram, one inbox',
    body: "Your customer doesn't care which app they DM'd you on — they expect one continuous conversation. Every WhatsApp message and Instagram DM lands in a single shared inbox, so nothing gets missed because it came in on the 'wrong' phone.",
    bullets: [
      'WhatsApp messages, Instagram DMs, and comment replies — one unified thread per customer.',
      'No dedicated Instagram phone, no separate app to check between shifts.',
      'The AI agent answers on both channels, using the same knowledge base and persona.',
    ],
  },
  {
    heading: 'No more juggling phones or tabs',
    body: "The same customer who DM'd on Instagram last week can message on WhatsApp today, and your team sees the full history in one place — no re-asking what they already told you.",
    conversation: [
      { from: 'customer', text: "It's me again, from Instagram — following up on the order I asked about" },
      { from: 'agent', text: "Welcome back! I can see our chat from Instagram — your order's ready, want the payment link here?" },
    ],
  },
  {
    heading: 'Assign, note, and label without leaving the thread',
    body: "A busy inbox needs traffic control. Assign a conversation to the right teammate, drop an internal note only your team sees, and label threads by intent — all without ever switching tools.",
    bullets: [
      'Assign any conversation to a specific teammate with one click.',
      'Internal notes stay attached to the thread, invisible to the customer.',
      'Labels (VIP, Complaint, Follow-up) keep the inbox organized as it grows.',
    ],
  },
  {
    heading: 'Every teammate sees the same history',
    body: 'When a lead gets handed from the AI agent to a human, or from one teammate to another, the full conversation — every message, every note — travels with it. No customer repeats themselves twice.',
    conversation: [
      { from: 'agent', text: 'Assigning this to Priya — customer wants a custom quote, budget already confirmed in the thread above.' },
    ],
  },
];

const STATS = [
  { value: '2 → 1', label: 'Channels, one inbox' },
  { value: 'Internal notes', label: 'Context stays with the thread' },
  { value: '0', label: 'Phones your team has to juggle' },
];

export default function SharedInboxPage() {
  return (
    <FeaturePage
      eyebrow="Shared Team Inbox"
      title="Stop juggling phones and tabs."
      subtitle="WhatsApp and Instagram DMs land in one shared inbox — assign conversations, leave internal notes, label threads, and let your whole team work off the same history."
      heroConversation={HERO_CONVERSATION}
      sections={SECTIONS}
      stats={STATS}
    />
  );
}

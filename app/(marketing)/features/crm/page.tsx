import type { Metadata } from 'next';
import { FeaturePage, type FeaturePageSection } from '@/modules/marketing/components/FeaturePage';
import type { ConversationTurn } from '@/modules/marketing/components/ConversationThread';

export const metadata: Metadata = {
  title: 'CRM with Lead Temperature',
  description:
    'A Kanban CRM built for WhatsApp — every lead automatically scored Hot, Warm, or Cold, AI qualification on every conversation, and follow-up detection so nothing goes cold by accident.',
};

const HERO_CONVERSATION: ConversationTurn[] = [
  {
    from: 'customer',
    text: "I'm looking for a dermatologist for acne, need it sorted this week, budget isn't an issue.",
  },
  {
    from: 'agent',
    text: "Got it — I'm marking you as a priority lead. Our specialist has an opening this Thursday. Shall I hold it?",
  },
];

const SECTIONS: FeaturePageSection[] = [
  {
    heading: 'A Kanban pipeline, built for WhatsApp',
    body: "Spreadsheets don't show you who's about to walk away. Every conversation lands as a card in a Kanban board your team already knows how to use — drag a lead from Inquiry to Negotiating to Won as the conversation moves.",
    bullets: [
      'Every WhatsApp and Instagram conversation becomes a lead card automatically — nothing entered by hand.',
      'Custom stages that match how your business actually sells, not a rigid default.',
      'Drag, filter, and assign — your team sees the same board, in real time.',
    ],
  },
  {
    heading: 'Automatic Hot, Warm, or Cold scoring',
    body: "You shouldn't need to read every chat to know who to call first. The AI agent reads intent, urgency, and budget signals from the conversation itself and scores the lead — so your hottest opportunities always float to the top.",
    conversation: [
      { from: 'customer', text: 'Need this sorted urgently, can pay today if you have a slot.' },
      { from: 'agent', text: "That's a priority booking — I'm marking you Hot and notifying our team right now." },
    ],
    pipeline: ['Lead', 'Hot'],
  },
  {
    heading: 'AI lead qualification, without a form',
    body: 'No customer wants to fill out a qualification form before they even talk to you. The AI agent asks the right questions naturally, mid-conversation, and captures budget, timeline, and intent straight into the lead card.',
    bullets: [
      'Budget, timeline, and product interest captured from natural conversation — no form to abandon.',
      'Every qualifying detail is visible on the lead card the moment your team opens it.',
      'Cold browsers stay Cold instead of clogging your team’s follow-up list.',
    ],
  },
  {
    heading: 'Follow-up detection so no lead goes cold by accident',
    body: "A Warm lead that goes quiet for three days is still a Warm lead — until someone forgets. AGENTiX flags conversations that have stalled and surfaces them before they slip to Cold on their own.",
    conversation: [
      { from: 'agent', text: 'Reminder: this Warm lead hasn’t replied in 3 days. Send a nudge, or let me follow up for you?' },
    ],
  },
];

const STATS = [
  { value: 'Hot · Warm · Cold', label: 'Scored automatically' },
  { value: 'Kanban', label: 'Drag-and-drop pipeline' },
  { value: 'Auto-flagged', label: 'Stalled follow-ups' },
];

export default function CrmPage() {
  return (
    <FeaturePage
      eyebrow="CRM with Lead Temperature"
      title="Know exactly who to call back first."
      subtitle="A Kanban CRM where every conversation is automatically scored Hot, Warm, or Cold, qualified by AI, and flagged the moment a follow-up is overdue."
      heroConversation={HERO_CONVERSATION}
      heroPipeline={['Lead', 'Hot']}
      sections={SECTIONS}
      stats={STATS}
    />
  );
}

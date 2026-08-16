import type { Metadata } from 'next';
import { FeaturePage, type FeaturePageSection } from '@/modules/marketing/components/FeaturePage';
import type { ConversationTurn } from '@/modules/marketing/components/ConversationThread';

export const metadata: Metadata = {
  title: 'AI Agent',
  description:
    'A real conversational AI agent, bundled — grounded in your own knowledge base, speaks Hindi and Hinglish naturally, knows your pricing, and hands off to a human when it should.',
};

const HERO_CONVERSATION: ConversationTurn[] = [
  { from: 'customer', text: 'Bhai, aapke gym ka monthly membership kitne ka hai?' },
  {
    from: 'agent',
    text: 'Hi! Monthly membership ₹1,499/month hai. 6-month plan lete hain toh ₹999/month ka rate milta hai. Konsa plan dekhna chahenge?',
  },
];

const SECTIONS: FeaturePageSection[] = [
  {
    heading: 'Grounded in your business, not a generic script',
    body: "This isn't a chatbot reciting canned lines. The AI agent is trained on your knowledge base — your services, pricing, policies, FAQs — and your brand's persona, so every reply sounds like your business, not a template.",
    bullets: [
      'Upload your knowledge base once — services, pricing, offers, policies — and the agent answers from it, accurately.',
      'A configurable persona keeps the tone consistent: formal for a clinic, casual for a salon, whatever fits your brand.',
      "Update your knowledge base and the agent's answers update with it — no retraining, no waiting.",
    ],
  },
  {
    heading: "Speaks the customer's language",
    body: 'Indian customers switch between Hindi, English, and Hinglish mid-sentence — and expect a reply in kind. The AI agent reads the language the customer is writing in and replies naturally in the same mix, without sounding translated.',
    conversation: [
      { from: 'customer', text: 'Order kab tak aayega? Mujhe kal chahiye tha.' },
      {
        from: 'agent',
        text: 'Samajh gaya! Aapka order abhi pack ho raha hai, kal shaam tak deliver ho jayega. Priority shipping laga du?',
      },
      { from: 'customer', text: 'Haan please, jaldi chahiye' },
      { from: 'agent', text: "Done — priority shipping laga di hai. Aapko tracking link abhi bhej raha hoon." },
    ],
  },
  {
    heading: 'Knows your pricing and offers, always current',
    body: "Nothing kills trust like a bot quoting last month's price. The agent reads live from your pricing and active offers, so a customer asking about a seasonal discount gets the discount that's actually running today.",
    bullets: [
      'Pricing and active offers are read live — not baked in at setup and forgotten.',
      'Runs the same offer your team is honoring in-store, so there is no awkward correction later.',
      'Every quoted price is logged against the conversation, so you can audit exactly what was promised.',
    ],
  },
  {
    heading: 'Hands off to a human exactly when it should',
    body: "The agent knows its limits. A complaint, an unusual request, or a customer explicitly asking for a person gets escalated to your team immediately, with the full conversation history attached — no re-explaining, no dropped context.",
    conversation: [
      { from: 'customer', text: 'This is the third time my order has come damaged. I want to speak to someone.' },
      {
        from: 'agent',
        text: "I'm really sorry about that. I'm connecting you with our support lead right now, and I've shared your full order history with them so you don't have to repeat it.",
      },
    ],
  },
];

const STATS = [
  { value: 'Hindi + Hinglish', label: 'Replies in the customer’s language' },
  { value: 'Bundled', label: 'Included from day one, not an add-on' },
  { value: 'Live', label: 'Pricing & offers, read in real time' },
];

export default function AiAgentPage() {
  return (
    <FeaturePage
      eyebrow="AI Agent"
      title="A real AI agent, bundled — not a bot."
      subtitle="Grounded in your own knowledge base and persona, fluent in Hindi and Hinglish, always quoting today's pricing, and smart enough to hand off to a human the moment it should."
      heroConversation={HERO_CONVERSATION}
      sections={SECTIONS}
      stats={STATS}
    />
  );
}

import type { FlowNode, FlowEdge } from '@/modules/flows/types';

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  trigger_type: 'keyword' | 'first_message';
  trigger_value: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ─── Helper to generate stable IDs ───────────────────────────────────────────
const n = (type: string, idx: number) => `${type}-tpl-${idx}`;
const e = (src: string, tgt: string, srcHandle?: string): FlowEdge => ({
  id: `e-${src}-${tgt}${srcHandle ? `-${srcHandle}` : ''}`,
  source: src,
  target: tgt,
  ...(srcHandle ? { sourceHandle: srcHandle } : {}),
});

// ─── Template 1: Welcome Message ─────────────────────────────────────────────
const WELCOME: FlowTemplate = {
  id: 'welcome',
  name: 'Welcome Message',
  description: 'Greet new contacts automatically on their first message',
  icon: '👋',
  trigger_type: 'first_message',
  trigger_value: null,
  nodes: [
    { id: n('start', 1), type: 'start', position: { x: 250, y: 50 },
      data: { label: 'First Message', triggerType: 'first_message', triggerValue: '' } },
    { id: n('message', 1), type: 'message', position: { x: 250, y: 200 },
      data: { label: 'Welcome', message: 'Hi! 👋 Welcome to our support. How can we help you today?' } },
    { id: n('end', 1), type: 'end', position: { x: 250, y: 360 },
      data: { label: 'End', message: '' } },
  ],
  edges: [
    e(n('start', 1), n('message', 1)),
    e(n('message', 1), n('end', 1)),
  ],
};

// ─── Template 2: Out of Office ────────────────────────────────────────────────
const OUT_OF_OFFICE: FlowTemplate = {
  id: 'out-of-office',
  name: 'Out of Office',
  description: 'Auto-reply when team is away with estimated return time',
  icon: '🏖️',
  trigger_type: 'keyword',
  trigger_value: 'hello',
  nodes: [
    { id: n('start', 1), type: 'start', position: { x: 250, y: 50 },
      data: { label: 'Trigger', triggerType: 'keyword', triggerValue: 'hello' } },
    { id: n('message', 1), type: 'message', position: { x: 250, y: 200 },
      data: { label: 'Away Message', message: "Hi! We're currently out of office 🏖️. We'll be back on Monday and will reply to your message first thing. For urgent matters, please call us." } },
    { id: n('end', 1), type: 'end', position: { x: 250, y: 360 },
      data: { label: 'End', message: '' } },
  ],
  edges: [
    e(n('start', 1), n('message', 1)),
    e(n('message', 1), n('end', 1)),
  ],
};

// ─── Template 3: Lead Qualifier ───────────────────────────────────────────────
const LEAD_QUALIFIER: FlowTemplate = {
  id: 'lead-qualifier',
  name: 'Lead Qualifier',
  description: 'Qualify leads with 3 quick questions before routing to an agent',
  icon: '🎯',
  trigger_type: 'first_message',
  trigger_value: null,
  nodes: [
    { id: n('start', 1), type: 'start', position: { x: 250, y: 30 },
      data: { label: 'First Message', triggerType: 'first_message', triggerValue: '' } },
    { id: n('message', 1), type: 'message', position: { x: 250, y: 170 },
      data: { label: 'Intro', message: "Hi! 👋 I'm here to help. Let me ask you a few quick questions to connect you with the right person." } },
    { id: n('question', 1), type: 'question', position: { x: 250, y: 320 },
      data: { label: 'Ask Name', message: 'What is your name?', timeoutHours: 24 } },
    { id: n('question', 2), type: 'question', position: { x: 250, y: 470 },
      data: { label: 'Ask Budget', message: 'What is your approximate budget? (e.g. ₹10k-50k)', timeoutHours: 24 } },
    { id: n('question', 3), type: 'question', position: { x: 250, y: 620 },
      data: { label: 'Ask Timeline', message: 'When are you looking to get started? (e.g. immediately, next month)', timeoutHours: 24 } },
    { id: n('assign_agent', 1), type: 'assign_agent', position: { x: 250, y: 770 },
      data: { label: 'Route to Agent', message: "Thank you! 🙏 I've noted your details. One of our team members will be with you shortly." } },
  ],
  edges: [
    e(n('start', 1), n('message', 1)),
    e(n('message', 1), n('question', 1)),
    e(n('question', 1), n('question', 2)),
    e(n('question', 2), n('question', 3)),
    e(n('question', 3), n('assign_agent', 1)),
  ],
};

// ─── Template 4: Order Status Check ──────────────────────────────────────────
const ORDER_STATUS: FlowTemplate = {
  id: 'order-status',
  name: 'Order Status Check',
  description: 'Let customers check their order status via WhatsApp',
  icon: '📦',
  trigger_type: 'keyword',
  trigger_value: 'order',
  nodes: [
    { id: n('start', 1), type: 'start', position: { x: 250, y: 50 },
      data: { label: 'Order Keyword', triggerType: 'keyword', triggerValue: 'order' } },
    { id: n('message', 1), type: 'message', position: { x: 250, y: 200 },
      data: { label: 'Ack Order Query', message: "Sure! I can help you track your order. 📦" } },
    { id: n('question', 1), type: 'question', position: { x: 250, y: 350 },
      data: { label: 'Ask Order ID', message: 'Please share your Order ID or Order Number (e.g. ORD-12345)', timeoutHours: 24 } },
    { id: n('assign_agent', 1), type: 'assign_agent', position: { x: 250, y: 500 },
      data: { label: 'Hand to Agent', message: "Got it! Let me check your order status. I'm connecting you to our team right now... ⏳" } },
  ],
  edges: [
    e(n('start', 1), n('message', 1)),
    e(n('message', 1), n('question', 1)),
    e(n('question', 1), n('assign_agent', 1)),
  ],
};

// ─── Template 5: Support Ticket Flow ─────────────────────────────────────────
const SUPPORT_TICKET: FlowTemplate = {
  id: 'support-ticket',
  name: 'Support Ticket',
  description: 'Collect issue details then route to support team',
  icon: '🎫',
  trigger_type: 'keyword',
  trigger_value: 'support',
  nodes: [
    { id: n('start', 1), type: 'start', position: { x: 250, y: 50 },
      data: { label: 'Support Keyword', triggerType: 'keyword', triggerValue: 'support' } },
    { id: n('message', 1), type: 'message', position: { x: 250, y: 200 },
      data: { label: 'Support Greeting', message: "Hello! 🎫 I'm here to help you with your issue." } },
    { id: n('question', 1), type: 'question', position: { x: 250, y: 350 },
      data: { label: 'Describe Issue', message: 'Please describe your issue in detail so I can route it to the right team.', timeoutHours: 48 } },
    { id: n('message', 2), type: 'message', position: { x: 250, y: 500 },
      data: { label: 'Confirm Receipt', message: "Thank you for the details! 📝 Your support ticket has been created. Our team will respond within 24 hours." } },
    { id: n('assign_agent', 1), type: 'assign_agent', position: { x: 250, y: 650 },
      data: { label: 'Assign Support', message: 'Connecting you to our support team now...' } },
  ],
  edges: [
    e(n('start', 1), n('message', 1)),
    e(n('message', 1), n('question', 1)),
    e(n('question', 1), n('message', 2)),
    e(n('message', 2), n('assign_agent', 1)),
  ],
};

// ─── Template 6: FAQ — Yes/No Branching ──────────────────────────────────────
const FAQ_BOT: FlowTemplate = {
  id: 'faq-bot',
  name: 'FAQ Bot with Branching',
  description: 'Answer common questions with Yes/No conditional routing',
  icon: '❓',
  trigger_type: 'keyword',
  trigger_value: 'faq',
  nodes: [
    { id: n('start', 1), type: 'start', position: { x: 250, y: 50 },
      data: { label: 'FAQ Keyword', triggerType: 'keyword', triggerValue: 'faq' } },
    { id: n('message', 1), type: 'message', position: { x: 250, y: 200 },
      data: { label: 'FAQ Menu', message: "Here are our most common questions:\n1. Pricing\n2. Delivery time\n3. Refund policy\n\nAre you looking for pricing info? Reply YES or NO." } },
    { id: n('condition', 1), type: 'condition', position: { x: 250, y: 370 },
      data: { label: 'Is Pricing?', keyword: 'yes', matchType: 'contains' } },
    { id: n('message', 2), type: 'message', position: { x: 80, y: 530 },
      data: { label: 'Pricing Info', message: 'Our plans start from ₹999/month. Visit our website for full pricing details.' } },
    { id: n('assign_agent', 1), type: 'assign_agent', position: { x: 420, y: 530 },
      data: { label: 'Other Question', message: "Let me connect you with a team member who can answer your specific question! 💬" } },
    { id: n('end', 1), type: 'end', position: { x: 80, y: 680 },
      data: { label: 'End', message: 'Hope that helps! Feel free to reach out anytime. 😊' } },
  ],
  edges: [
    e(n('start', 1), n('message', 1)),
    e(n('message', 1), n('condition', 1)),
    e(n('condition', 1), n('message', 2), 'yes'),
    e(n('condition', 1), n('assign_agent', 1), 'no'),
    e(n('message', 2), n('end', 1)),
  ],
};

// ─── Template 7: Appointment Booking ─────────────────────────────────────────
const APPOINTMENT: FlowTemplate = {
  id: 'appointment-booking',
  name: 'Appointment Booking',
  description: 'Collect date/time preferences and confirm booking with agent',
  icon: '📅',
  trigger_type: 'keyword',
  trigger_value: 'appointment',
  nodes: [
    { id: n('start', 1), type: 'start', position: { x: 250, y: 50 },
      data: { label: 'Appointment Keyword', triggerType: 'keyword', triggerValue: 'appointment' } },
    { id: n('message', 1), type: 'message', position: { x: 250, y: 200 },
      data: { label: 'Booking Intro', message: "Great! I can help you book an appointment. 📅 Let me collect a few details." } },
    { id: n('question', 1), type: 'question', position: { x: 250, y: 350 },
      data: { label: 'Ask Preferred Date', message: 'What date works best for you? (e.g. Monday June 10)', timeoutHours: 48 } },
    { id: n('question', 2), type: 'question', position: { x: 250, y: 500 },
      data: { label: 'Ask Preferred Time', message: 'What time slot do you prefer? (e.g. 10am or 3pm)', timeoutHours: 48 } },
    { id: n('question', 3), type: 'question', position: { x: 250, y: 650 },
      data: { label: 'Ask Purpose', message: 'What is the purpose of the appointment? (e.g. product demo, consultation)', timeoutHours: 48 } },
    { id: n('assign_agent', 1), type: 'assign_agent', position: { x: 250, y: 800 },
      data: { label: 'Confirm Booking', message: "Thanks! 📋 I've noted your preferred slot. Our team will confirm the appointment and send a reminder. See you soon!" } },
  ],
  edges: [
    e(n('start', 1), n('message', 1)),
    e(n('message', 1), n('question', 1)),
    e(n('question', 1), n('question', 2)),
    e(n('question', 2), n('question', 3)),
    e(n('question', 3), n('assign_agent', 1)),
  ],
};

export const FLOW_TEMPLATES: FlowTemplate[] = [
  WELCOME,
  OUT_OF_OFFICE,
  LEAD_QUALIFIER,
  ORDER_STATUS,
  SUPPORT_TICKET,
  FAQ_BOT,
  APPOINTMENT,
];

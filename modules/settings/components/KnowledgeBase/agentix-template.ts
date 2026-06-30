import type { KBEntryDraft } from './types';

export const AGENTIX_TEMPLATE: KBEntryDraft[] = [
  {
    title: 'What is Agentix?',
    category: 'product',
    tags: ['overview', 'intro', 'agentix'],
    content: `Agentix is a powerful WhatsApp Business automation platform by V4TOU Tech. It lets businesses manage customer conversations, automate replies, run broadcast campaigns, build chatbot flows, track CRM leads, and get AI-powered insights — all from one dashboard.

Key highlights:
• AI auto-reply with your company's knowledge base
• Broadcast campaigns to thousands of customers
• CRM pipeline for leads and deals
• Chatbot flow builder (no code)
• Analytics and CSAT tracking
• Team collaboration with agent assignment`,
  },
  {
    title: 'Pricing Plans',
    category: 'pricing',
    tags: ['pricing', 'plans', 'cost', 'subscription'],
    content: `Agentix offers flexible pricing for every business size:

• **Starter** — ₹999/month: 1 WhatsApp number, 2 agents, 1,000 conversations/month, basic automation
• **Professional** — ₹2,499/month: 1 WhatsApp number, 10 agents, unlimited conversations, AI replies, CRM, advanced flows
• **Enterprise** — Custom pricing: Multiple numbers, unlimited agents, dedicated support, custom integrations, SLA guarantees

All plans include a **14-day free trial**. No credit card required to start.

Annual billing gets 20% discount.`,
  },
  {
    title: 'Free Trial',
    category: 'pricing',
    tags: ['trial', 'free', 'start'],
    content: `Yes! Agentix offers a 14-day free trial on all plans — no credit card required.

During the trial you get full access to all Professional plan features. After 14 days, choose a plan to continue. Your data is saved.

To start your free trial, sign up at https://app.aiagentixdev.com and connect your WhatsApp Business API account.`,
  },
  {
    title: 'How to Get Started',
    category: 'support',
    tags: ['setup', 'onboarding', 'getting started', 'connect'],
    content: `Getting started with Agentix takes about 15 minutes:

1. Sign up at our website
2. Create a workspace for your business
3. Connect your WhatsApp Business API (you need a Meta-approved WhatsApp Business API account)
4. Add your team agents
5. Set up your first automated reply or flow
6. Start managing conversations!

Need help setting up WhatsApp Business API? Contact our support team — we guide you through the Meta approval process.`,
  },
  {
    title: 'WhatsApp Business API Requirement',
    category: 'product',
    tags: ['whatsapp', 'api', 'meta', 'requirement', 'business api'],
    content: `Agentix requires a **WhatsApp Business API** account (not the regular WhatsApp Business app).

WhatsApp Business API gives you:
• Send messages to thousands of customers
• Use automation and bots
• Multiple agents on one number
• Message templates for broadcasts

To get WhatsApp Business API:
1. Apply through Meta Business Manager
2. Verify your business (takes 1-3 business days)
3. Get your Phone Number ID and Access Token
4. Enter these in Agentix Settings → WhatsApp

Our team helps you with the Meta approval process — just contact support.`,
  },
  {
    title: 'Features Overview',
    category: 'product',
    tags: ['features', 'capabilities', 'what can it do'],
    content: `Agentix includes these enterprise features:

**Messaging:**
• Shared team inbox for all WhatsApp messages
• Broadcast campaigns with scheduling
• Interactive messages (buttons, lists)
• Internal notes between agents

**Automation:**
• AI-powered auto-replies with your knowledge base
• Chatbot flow builder (no coding)
• Inbox rules (auto-assign, auto-tag)
• Follow-up drip sequences

**CRM & Sales:**
• Lead pipeline with drag-drop Kanban
• Contact management with tags
• Payment link sending (Razorpay)
• Order status bot

**Analytics:**
• Message delivery and read rates
• Agent performance reports
• CSAT customer satisfaction scores
• CSV export`,
  },
  {
    title: 'Support Hours and Contact',
    category: 'hours',
    tags: ['support', 'help', 'contact', 'hours', 'team'],
    content: `V4TOU Tech support is available:
• **Email:** support@v4toutech.com
• **WhatsApp:** Message us directly (we use Agentix for support!)
• **Hours:** Monday to Saturday, 10:00 AM – 6:00 PM IST
• **Response time:** Within 2-4 hours during business hours

For urgent issues (system down, data loss), use the urgent flag when contacting support — we prioritize these within 1 hour.

Documentation and guides are available at our help center.`,
  },
  {
    title: 'Refund Policy',
    category: 'policy',
    tags: ['refund', 'money back', 'cancel', 'policy'],
    content: `We offer a **30-day money-back guarantee** on all paid plans.

If you're not satisfied within 30 days of your first payment, contact us for a full refund — no questions asked.

After 30 days, refunds are pro-rated for unused months if you cancel.

To cancel your subscription: Settings → Billing → Cancel Plan. Your account stays active until the end of the billing period.`,
  },
  {
    title: 'Integrations and API',
    category: 'product',
    tags: ['integrations', 'api', 'zapier', 'shopify', 'webhooks'],
    content: `Agentix integrates with popular tools:

• **Razorpay** — Send payment links directly in WhatsApp
• **Outbound Webhooks** — Connect to Zapier, n8n, or any tool
• **Shopify** — Auto-send order confirmations and shipping updates
• **Google Sheets** — Sync contacts
• **REST API** — Build custom integrations with our public API

More integrations are added regularly. Contact us if you need a specific integration.`,
  },
  {
    title: 'Data Security and Privacy',
    category: 'policy',
    tags: ['security', 'privacy', 'data', 'gdpr', 'safe'],
    content: `Your data security is our top priority:

• All data is encrypted in transit (TLS 1.3) and at rest (AES-256)
• Hosted on Supabase (ISO 27001 certified infrastructure)
• We never share your customer data with third parties
• GDPR compliant — request data deletion anytime
• Regular security audits and penetration testing
• Role-based access control for your team

Contact us at privacy@v4toutech.com for data deletion requests or privacy questions.`,
  },
  {
    title: 'Broadcast Limits and WhatsApp Policies',
    category: 'policy',
    tags: ['broadcast', 'limits', 'spam', 'policy', 'whatsapp rules'],
    content: `WhatsApp has strict anti-spam policies. Here's what you need to know:

• Only send broadcasts to users who have **opted in** to receive messages
• Use approved message templates for first-contact broadcasts
• WhatsApp limits: ~1,000 messages/day (basic tier), more with higher business tier
• Sending spam or unsolicited messages can result in your number being banned

Best practices:
• Always include opt-out instructions ("Reply STOP to unsubscribe")
• Personalize messages with customer names
• Send relevant, valuable content only

Agentix has built-in rate limiting to help you stay within WhatsApp guidelines.`,
  },
  {
    title: 'Team and Agent Management',
    category: 'support',
    tags: ['team', 'agents', 'roles', 'permissions', 'assign'],
    content: `You can add unlimited agents (based on your plan) to your Agentix workspace.

**Roles available:**
• **Super Admin** — Full access including billing
• **Admin** — Manage team, settings, all conversations
• **Manager** — View analytics, manage conversations, assign agents
• **Agent** — Handle assigned conversations only

To add a team member: Settings → Team → Invite Agent (enter their email). They receive an invite link to join your workspace.

Conversations can be auto-assigned via Inbox Rules or manually assigned from the conversation header.`,
  },
];

export const ECOMMERCE_TEMPLATE: KBEntryDraft[] = [
  {
    title: 'Shipping Policy',
    category: 'shipping',
    tags: ['shipping', 'delivery', 'time'],
    content: 'We offer standard (5-7 days, ₹99) and express (2-3 days, ₹199) shipping across India. Orders above ₹999 get free standard shipping. Order tracking link is sent via WhatsApp once dispatched.',
  },
  {
    title: 'Return and Refund Policy',
    category: 'returns',
    tags: ['return', 'refund', 'exchange'],
    content: 'Returns accepted within 7 days of delivery for unused items in original packaging. Raise a return request via WhatsApp with your order ID and reason. Refund processed within 5-7 business days to original payment method.',
  },
  {
    title: 'Order Tracking',
    category: 'support',
    tags: ['track', 'order', 'status', 'delivery'],
    content: 'To track your order, send your Order ID (e.g. "order ORD-12345") in this chat. You can also check your email for the tracking link sent at time of dispatch.',
  },
  {
    title: 'Payment Methods',
    category: 'pricing',
    tags: ['payment', 'upi', 'card', 'cod'],
    content: 'We accept UPI (GPay, PhonePe, Paytm), Credit/Debit cards, Net banking, and Cash on Delivery (COD). EMI available on orders above ₹3,000 on select cards.',
  },
  {
    title: 'Cancellation Policy',
    category: 'policy',
    tags: ['cancel', 'order cancel'],
    content: 'Orders can be cancelled within 2 hours of placing. After dispatch, cancellation is not possible — use the return process instead. To cancel, send your Order ID in this chat.',
  },
];

export const SERVICES_TEMPLATE: KBEntryDraft[] = [
  {
    title: 'Our Services',
    category: 'product',
    tags: ['services', 'what we do', 'offerings'],
    content: 'We offer professional [service type] services including [service 1], [service 2], and [service 3]. All services come with a satisfaction guarantee. Contact us for a free consultation.',
  },
  {
    title: 'Pricing and Packages',
    category: 'pricing',
    tags: ['pricing', 'packages', 'cost', 'quote'],
    content: 'Our pricing depends on the scope of work. Basic package starts from ₹X, standard from ₹Y, and premium from ₹Z. We also offer custom packages. Contact us for a personalized quote.',
  },
  {
    title: 'Business Hours',
    category: 'hours',
    tags: ['hours', 'open', 'timing', 'available'],
    content: 'We are open Monday to Saturday, 9:00 AM to 7:00 PM. Closed on Sundays and public holidays. For urgent requests outside hours, WhatsApp us and we\'ll respond on the next business day.',
  },
  {
    title: 'How to Book an Appointment',
    category: 'support',
    tags: ['book', 'appointment', 'schedule'],
    content: 'To book an appointment, reply with your preferred date and time. We\'ll confirm availability within 2 hours. You can also call us at [phone number]. Advance booking of 24 hours is recommended.',
  },
];

export const RESTAURANT_TEMPLATE: KBEntryDraft[] = [
  {
    title: 'Menu and Specialties',
    category: 'product',
    tags: ['menu', 'food', 'dishes', 'specialty'],
    content: 'Our menu includes a wide variety of [cuisine type] dishes. Our specialties are [dish 1], [dish 2], and [dish 3]. View our full menu at [website]. We offer both veg and non-veg options.',
  },
  {
    title: 'Opening Hours and Location',
    category: 'hours',
    tags: ['hours', 'location', 'address', 'open'],
    content: 'We are open daily from 11:00 AM to 11:00 PM. Located at [address]. Free parking available. Nearest metro: [station name]. For large groups (10+), call ahead for a reserved section.',
  },
  {
    title: 'Delivery and Takeaway',
    category: 'shipping',
    tags: ['delivery', 'takeaway', 'order', 'swiggy', 'zomato'],
    content: 'We offer home delivery via Swiggy and Zomato. Delivery radius: 5 km. Minimum order: ₹200. Also available for takeaway — just mention "takeaway" when ordering and your order will be ready in 20-30 minutes.',
  },
  {
    title: 'Table Reservation',
    category: 'support',
    tags: ['reservation', 'book table', 'group'],
    content: 'To reserve a table, message us with: date, time, number of people, and your name. We hold reservations for 15 minutes past the booking time. For groups of 15+, advance booking of 48 hours required.',
  },
];

export const BUILT_IN_TEMPLATES = [
  {
    id: 'agentix',
    name: 'Agentix / V4TOU Tech',
    description: 'Complete knowledge base for the Agentix WhatsApp automation platform',
    industry: 'SaaS / Software',
    entries: AGENTIX_TEMPLATE,
    entryCount: AGENTIX_TEMPLATE.length,
    recommended: true,
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce Store',
    description: 'Shipping, returns, order tracking, payments — essential for online stores',
    industry: 'E-Commerce / Retail',
    entries: ECOMMERCE_TEMPLATE,
    entryCount: ECOMMERCE_TEMPLATE.length,
    recommended: false,
  },
  {
    id: 'services',
    name: 'Service Business',
    description: 'Pricing, booking, hours, services overview — for consultants and agencies',
    industry: 'Professional Services',
    entries: SERVICES_TEMPLATE,
    entryCount: SERVICES_TEMPLATE.length,
    recommended: false,
  },
  {
    id: 'restaurant',
    name: 'Restaurant / Cafe',
    description: 'Menu, hours, delivery, reservations — for food businesses',
    industry: 'Food & Beverage',
    entries: RESTAURANT_TEMPLATE,
    entryCount: RESTAURANT_TEMPLATE.length,
    recommended: false,
  },
] as const;

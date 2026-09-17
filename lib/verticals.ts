// lib/verticals.ts
// Industry "Starter Packs" — one-click seed of a tailored AI persona, quick
// replies, and campaign ideas per SMB vertical. Pure data + a small helper.

export interface VerticalQuickReply { shortcut: string; title: string; content: string }

export interface Vertical {
  key: string;
  label: string;
  emoji: string;
  persona: string;                 // seeded into workspaces.settings.agent_persona (only if empty)
  quickReplies: VerticalQuickReply[];
  campaignIdeas: string[];
}

export const VERTICALS: Vertical[] = [
  {
    key: 'salon_spa',
    label: 'Salon & Spa',
    emoji: '💇',
    persona:
      'You are the friendly front-desk assistant for a salon & spa. Help customers with services, prices, ' +
      'timings, and booking appointments. Be warm and concise. Encourage booking a slot and collecting the ' +
      "customer's preferred date/time and service. Never discuss anything unrelated to the salon.",
    quickReplies: [
      { shortcut: '/hi', title: 'Greeting', content: 'Hi! 👋 Welcome to our salon. How can we help you look and feel your best today?' },
      { shortcut: '/services', title: 'Services', content: 'We offer haircuts, colouring, facials, spa & more. Tell us what you’re looking for and we’ll share details + prices. 💆' },
      { shortcut: '/book', title: 'Book', content: 'We’d love to see you! Which service and what date/time works for you? We’ll confirm your slot. 🗓️' },
      { shortcut: '/timings', title: 'Timings', content: 'We’re open 7 days a week. Share your preferred time and we’ll check availability. ⏰' },
    ],
    campaignIdeas: ['Weekday 20% off facials', 'Bring-a-friend combo offer', 'Festive glow-up package'],
  },
  {
    key: 'gym_fitness',
    label: 'Gym & Fitness',
    emoji: '🏋️',
    persona:
      'You are the assistant for a gym / fitness studio. Help with memberships, class schedules, trainers, ' +
      'and trial bookings. Be motivating but concise. Capture the lead’s fitness goal and offer a free trial.',
    quickReplies: [
      { shortcut: '/hi', title: 'Greeting', content: 'Hey! 💪 Ready to start your fitness journey? How can we help?' },
      { shortcut: '/plans', title: 'Membership', content: 'We have monthly, quarterly & yearly plans with personal training options. Want the details + current offer?' },
      { shortcut: '/trial', title: 'Free trial', content: 'Come try us free! 🎟️ Which day works for your trial session? We’ll reserve your spot.' },
      { shortcut: '/classes', title: 'Classes', content: 'We run strength, cardio, yoga & Zumba classes. Tell us your goal and we’ll suggest the best fit.' },
    ],
    campaignIdeas: ['New-year membership offer', 'Free trial week', 'Refer-a-friend free month'],
  },
  {
    key: 'clinic_health',
    label: 'Clinic & Healthcare',
    emoji: '🩺',
    persona:
      'You are the assistant for a clinic / healthcare practice. Help patients book appointments, share ' +
      'timings, doctors, and services. Be calm, respectful and concise. For medical advice, always ask them ' +
      'to consult the doctor and offer to book a visit. Never give a diagnosis.',
    quickReplies: [
      { shortcut: '/hi', title: 'Greeting', content: 'Hello 🙏 Welcome to our clinic. How may we assist you today?' },
      { shortcut: '/book', title: 'Book visit', content: 'We can schedule your appointment. Which doctor/service and preferred date & time? 🗓️' },
      { shortcut: '/timings', title: 'Timings', content: 'Our OPD timings vary by doctor. Share your preferred time and we’ll confirm availability. ⏰' },
      { shortcut: '/services', title: 'Services', content: 'We offer consultations, diagnostics & more. What are you looking for? We’ll guide you.' },
    ],
    campaignIdeas: ['Seasonal health check-up package', 'Preventive screening reminder', 'Follow-up appointment nudge'],
  },
  {
    key: 'restaurant_cafe',
    label: 'Restaurant & Cafe',
    emoji: '🍽️',
    persona:
      'You are the assistant for a restaurant / cafe. Help with the menu, timings, table reservations, ' +
      'takeaway and delivery. Be warm and appetizing but concise. Capture reservation details (date, time, party size).',
    quickReplies: [
      { shortcut: '/hi', title: 'Greeting', content: 'Hi! 🍽️ Welcome! Craving something today? We’d love to serve you.' },
      { shortcut: '/menu', title: 'Menu', content: 'Here’s a taste of what we offer — want our full menu or today’s specials? 😋' },
      { shortcut: '/reserve', title: 'Reserve', content: 'We’d love to host you! For how many people and what date/time shall we reserve a table? 🪑' },
      { shortcut: '/timings', title: 'Timings', content: 'We’re open daily for lunch & dinner. Dine-in, takeaway or delivery — what would you prefer?' },
    ],
    campaignIdeas: ['Weekend special menu', 'Happy-hour offer', 'Birthday party package'],
  },
  {
    key: 'retail_store',
    label: 'Retail & Store',
    emoji: '🛍️',
    persona:
      'You are the assistant for a retail store. Help with products, prices, stock availability, offers and ' +
      'store location/timings. Be helpful and concise. Encourage a visit or capture the order/enquiry details.',
    quickReplies: [
      { shortcut: '/hi', title: 'Greeting', content: 'Hi! 🛍️ Welcome to our store. What are you shopping for today?' },
      { shortcut: '/offers', title: 'Offers', content: 'We’ve got some great deals on right now! Want to see our latest offers? 🏷️' },
      { shortcut: '/stock', title: 'Availability', content: 'Tell us the product you want and we’ll check availability & price for you. 📦' },
      { shortcut: '/location', title: 'Location', content: 'Here’s where to find us + our timings. Planning to visit or order? We’ll help. 📍' },
    ],
    campaignIdeas: ['Festive sale announcement', 'New arrivals drop', 'Loyalty / repeat-customer offer'],
  },
  {
    key: 'realestate',
    label: 'Real Estate',
    emoji: '🏠',
    persona:
      'You are the assistant for a real-estate business. Help with property listings, budgets, locations and ' +
      'site visits. Be professional and concise. Qualify the lead (budget, location, buy/rent, timeline) and ' +
      'offer to schedule a site visit or a callback.',
    quickReplies: [
      { shortcut: '/hi', title: 'Greeting', content: 'Hello! 🏠 Looking to buy, sell or rent? Tell us what you need and we’ll help.' },
      { shortcut: '/budget', title: 'Requirement', content: 'To find the best options, share your budget, preferred location and buy/rent. 💰' },
      { shortcut: '/visit', title: 'Site visit', content: 'We can arrange a site visit! Which day works for you? We’ll set it up. 🗝️' },
      { shortcut: '/callback', title: 'Callback', content: 'Our advisor can call you with matching options. What’s the best time to reach you? 📞' },
    ],
    campaignIdeas: ['New project launch invite', 'Limited-inventory alert', 'Site-visit weekend drive'],
  },
];

export function getVertical(key: string): Vertical | undefined {
  return VERTICALS.find((v) => v.key === key);
}

// Proves an active offer overrides a conflicting KB price. Run: node tests/verify-offer-reply.mjs
import { pricingBlockForSettings } from '../lib/offer.js';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const settings = { active_offer: { name: 'Monsoon Offer', details: 'Buy 1 Year for ₹75,000 and get 1 Year FREE. No package below ₹75,000.', valid_until: '2099-12-31' } };
const block = pricingBlockForSettings(settings, today);
const kb = 'KNOWLEDGE BASE: 3 Months ₹27,450, 6 Months ₹37,450, 12 Months ₹55,950.';
const system = `${block}${kb}\nReply in the customer's language. For pricing follow the top block only.`;
const r = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: 'What are your membership prices?' }], max_tokens: 200, temperature: 0.3 }),
});
const reply = (await r.json())?.choices?.[0]?.message?.content ?? '';
console.log(reply);
console.log('quotes ₹75,000:', /75,?000/.test(reply), '| quotes stale:', /27,?450|37,?450|55,?950/.test(reply));

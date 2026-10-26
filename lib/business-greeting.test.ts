import { describe, it, expect } from 'vitest';
import { isBusinessGreeting } from './business-greeting';

describe('isBusinessGreeting', () => {
  // Every string here was sent to a client's number in production.
  it('recognises the greetings that became fake leads', () => {
    const real = [
      '👋 Welcome to Cuddle Threadz!\n\nThank you for reaching out to us. We are a kidswear manufacturer.',
      'Thank you for contacting Nirmal Ayurved! \nTo schedule your appointment with Dr. Prashant please share',
      '🌸 Greetings from Ramas Resort & Palace 🌸\n\nWarm wishes and heartfelt regards to you and your family',
      'Thank you for your message. We’re unavailable right now, but will respond as soon as possible.',
      'In case of a *message* : \nWe will revert as soon as possible.\n\nIn case of a *missed call*',
      '👋 Welcome to Sharda Health Care Solutions!\n Thank you for reaching out. How can we assist you today?',
      '*पुष्पांजलि इंडस्ट्रीज से जुड़ने के लिए आपका धन्यवाद* 🙏🏻😊\n\n_(Selling Success Since 2008)_',
    ];
    for (const t of real) expect(isBusinessGreeting(t), t.slice(0, 40)).toBe(true);
  });

  // Flagging one of these would mark a buyer as noise, which is the costlier
  // mistake — the flag is meant to clean up reporting, not to hide customers.
  it('leaves real customer messages alone', () => {
    const customers = [
      'Hi, what is the price of the 100g cream?',
      'Mujhe kal shaam 4 baje appointment chahiye',
      'Hello',
      'Welcome',
      'thank you',
      'Yes please send me the details, I am interested in buying for my shop',
      'Share location pl',
      '[Tapped button: "Shop Now"]',
      'Thank you for the quick reply, I will check and confirm tomorrow',
    ];
    for (const t of customers) expect(isBusinessGreeting(t), t).toBe(false);
  });

  it('ignores empty and short text', () => {
    expect(isBusinessGreeting(null)).toBe(false);
    expect(isBusinessGreeting(undefined)).toBe(false);
    expect(isBusinessGreeting('   ')).toBe(false);
    // Long enough to be a greeting only when it carries a business's pitch.
    expect(isBusinessGreeting('Welcome to my home')).toBe(false);
  });
});

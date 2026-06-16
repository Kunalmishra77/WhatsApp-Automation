// Canonical phone format used across the app: digits only, with country code,
// no leading '+' — matches WhatsApp's wa_id format exactly (msg.from in webhooks).
// Every contact-creation path must normalize through this so a contact who
// texts in on WhatsApp always resolves to the same contact row that was
// imported/added manually, instead of creating a duplicate.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

// lib/spam.ts — engagement-gated spam rule. A conversation is spam ONLY when a
// customer's first-and-only inbound is categorized 'spam' and they have no lead.
// Any later inbound, any non-spam intent, or any lead clears it — so a genuine,
// engaged lead can never be marked spam.
export function decideSpam(input: {
  label: string | null;
  inboundCount: number;
  hasLead: boolean;
}): boolean {
  return input.label === 'spam' && input.inboundCount === 1 && !input.hasLead;
}

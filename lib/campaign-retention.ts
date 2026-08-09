// lib/campaign-retention.ts — pure per-campaign retention status.
// retention_at = COALESCE(completed_at, created_at) + 2 calendar months.

export type CampaignRetentionStatus = 'active' | 'expiring' | 'expired' | 'deleted';

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function computeRetention(
  campaign: { created_at: string; completed_at: string | null; data_deleted_at: string | null },
  now: Date,
): { retentionAt: string; status: CampaignRetentionStatus; daysRemaining: number } {
  const base = new Date(campaign.completed_at ?? campaign.created_at);
  const retention = new Date(base);
  retention.setMonth(retention.getMonth() + 2);
  const retentionAt = retention.toISOString();
  const daysRemaining = Math.ceil((retention.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  let status: CampaignRetentionStatus;
  if (campaign.data_deleted_at) status = 'deleted';
  else if (now.getTime() >= retention.getTime()) status = 'expired';
  else if (now.getTime() >= retention.getTime() - EXPIRING_WINDOW_MS) status = 'expiring';
  else status = 'active';

  return { retentionAt, status, daysRemaining };
}

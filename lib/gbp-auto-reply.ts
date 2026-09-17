// lib/gbp-auto-reply.ts
// Optional, per-workspace automation: when a NEW Google review is synced and
// the workspace has auto-reply enabled, draft a warm reply with AI and post it
// straight to Google. Off by default — only qualifying high-star reviews with
// no existing reply are auto-answered. Everything is fail-soft: a failure here
// never breaks the sync.

import { callAI } from '@/lib/ai-client';
import { replyToReview } from '@/lib/google-business';

export interface AutoReplyConfig {
  enabled: boolean;
  minStars: number; // only auto-reply to reviews at or above this rating
}

export function readAutoReplyConfig(settings: unknown): AutoReplyConfig {
  const s = (settings ?? {}) as Record<string, unknown>;
  const min = Number(s.gbp_auto_reply_min_stars ?? 4);
  return {
    enabled: s.gbp_auto_reply_enabled === true,
    minStars: Number.isFinite(min) ? Math.min(Math.max(min, 1), 5) : 4,
  };
}

interface AutoReplyReview {
  workspaceId: string;
  businessName: string;
  accessToken: string;
  accountId: string;
  locationId: string;
  reviewId: string;             // Google review id
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
}

// Draft + post a reply to one review. Returns true if a reply was posted.
export async function autoReplyToReview(db: any, r: AutoReplyReview): Promise<boolean> {
  try {
    const draft = await callAI([
      {
        role: 'system',
        content:
          `You write short, warm, professional replies to Google Business reviews on behalf of "${r.businessName}". ` +
          `Thank the customer by name when available, address their point specifically, stay under 60 words, ` +
          `never be defensive, and for negative reviews apologize and invite them to make it right. ` +
          `Reply in the same language as the review. Output only the reply text.`,
      },
      {
        role: 'user',
        content: `Reviewer: ${r.reviewerName ?? 'Customer'}\nRating: ${r.starRating ?? '?'}/5\nReview: ${r.comment ?? '(no text)'}`,
      },
    ]);
    if (!draft?.trim()) return false;

    const res = await replyToReview(r.accessToken, r.accountId, r.locationId, r.reviewId, draft.trim());
    if (!res.ok) {
      console.error('[GBP auto-reply] Google rejected reply:', res.error);
      return false;
    }

    await db.from('gbp_reviews')
      .update({
        reply_comment: draft.trim(),
        ai_draft: draft.trim(),
        reply_status: 'posted',
        reply_update_time: new Date().toISOString(),
      })
      .eq('workspace_id', r.workspaceId)
      .eq('review_id', r.reviewId);

    return true;
  } catch (err) {
    console.error('[GBP auto-reply] error:', err);
    return false;
  }
}

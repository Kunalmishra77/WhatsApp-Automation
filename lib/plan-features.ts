export type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise';

export const PLAN_LIMITS: Record<PlanKey, {
  maxAgents: number;
  maxMessages: number;      // per month
  maxContacts: number;
  maxCampaigns: number;     // per month
  maxKbEntries: number;
  maxFlows: number;
  analyticsHistoryDays: number;
  apiCallsPerDay: number;
}> = {
  free: {
    maxAgents: 2,
    maxMessages: 1000,
    maxContacts: 500,
    maxCampaigns: 3,
    maxKbEntries: 20,
    maxFlows: 1,
    analyticsHistoryDays: 7,
    apiCallsPerDay: 0,
  },
  starter: {
    maxAgents: 2,
    maxMessages: 3000,
    maxContacts: 1000,
    maxCampaigns: 5,
    maxKbEntries: 30,
    maxFlows: 3,
    analyticsHistoryDays: 7,
    apiCallsPerDay: 0,
  },
  pro: {
    maxAgents: 10,
    maxMessages: 25000,
    maxContacts: 10000,
    maxCampaigns: 50,
    maxKbEntries: 500,
    maxFlows: 20,
    analyticsHistoryDays: 90,
    apiCallsPerDay: 100,
  },
  enterprise: {
    maxAgents: 25,
    maxMessages: 100000,
    maxContacts: 50000,
    maxCampaigns: 200,
    maxKbEntries: 2000,
    maxFlows: 50,
    analyticsHistoryDays: 365,
    apiCallsPerDay: 1000,
  },
};

// Feature flags — which plan unlocks each feature
// Usage: hasFeature(workspace.plan, 'crm')
export const PLAN_FEATURES: Record<PlanKey, Set<string>> = {
  free: new Set([
    'conversations', 'contacts', 'templates_send', 'campaigns_basic',
    'quick_replies', 'business_hours', 'analytics_basic', 'media_send',
    'auto_reply_basic', 'opt_out_detection',
  ]),
  starter: new Set([
    'conversations', 'contacts', 'templates_send', 'campaigns_basic',
    'quick_replies', 'business_hours', 'analytics_basic', 'media_send',
    'auto_reply_basic', 'opt_out_detection',
  ]),
  pro: new Set([
    // All starter features
    'conversations', 'contacts', 'templates_send', 'campaigns_basic',
    'quick_replies', 'business_hours', 'analytics_basic', 'media_send',
    'auto_reply_basic', 'opt_out_detection',
    // Pro-only
    'templates_create', 'crm', 'lead_scoring', 'lead_temperature',
    'contact_lifecycle', 'vision_ai', 'flows', 'flow_templates',
    'flow_branching', 'sla', 'csat', 'follow_up_sequences',
    'inbox_rules', 'custom_fields', 'contact_notes', 'sentiment',
    'session_pause', 'chat_summary', 'ab_testing', 'campaign_analytics',
    'labels', 'qr_code', 'async_campaigns', 'media_library',
    'api_limited', 'contact_import', 'global_search', 'audit_logs',
    'analytics_full',
  ]),
  enterprise: new Set([
    // All pro features
    'conversations', 'contacts', 'templates_send', 'campaigns_basic',
    'quick_replies', 'business_hours', 'analytics_basic', 'media_send',
    'auto_reply_basic', 'opt_out_detection',
    'templates_create', 'crm', 'lead_scoring', 'lead_temperature',
    'contact_lifecycle', 'vision_ai', 'flows', 'flow_templates',
    'flow_branching', 'sla', 'csat', 'follow_up_sequences',
    'inbox_rules', 'custom_fields', 'contact_notes', 'sentiment',
    'session_pause', 'chat_summary', 'ab_testing', 'campaign_analytics',
    'labels', 'qr_code', 'async_campaigns', 'media_library',
    'api_limited', 'contact_import', 'global_search', 'audit_logs',
    'analytics_full',
    // Enterprise-only
    'custom_domain', 'white_label', 'brand_color',
    'workload_balancer', 'smart_auto_assign', 'semantic_search',
    'daily_digest', 'dual_llm', 'conversation_merge',
    'revenue_attribution', 'vip_contacts', 'web_widget',
    'instagram_messenger', 'api_full', 'priority_support',
  ]),
};

export function hasFeature(plan: string, feature: string): boolean {
  const planKey = (plan ?? 'free') as PlanKey;
  const features = PLAN_FEATURES[planKey] ?? PLAN_FEATURES.free;
  return features.has(feature);
}

export function getLimits(plan: string) {
  const planKey = (plan ?? 'free') as PlanKey;
  return PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free;
}

export const PLAN_DISPLAY: Record<PlanKey, { name: string; price: number; color: string }> = {
  free:       { name: 'Free',       price: 0,    color: 'gray'   },
  starter:    { name: 'Starter',    price: 1499, color: 'blue'   },
  pro:        { name: 'Pro',        price: 2999, color: 'violet' },
  enterprise: { name: 'Enterprise', price: 9999, color: 'amber'  },
};

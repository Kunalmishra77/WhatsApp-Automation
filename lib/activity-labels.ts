// Client-safe half of the activity trail: the wording only.
//
// lib/activity-log.ts can only run on the server (it uses next/headers and the
// service-role client), so anything the browser needs lives here instead.

/**
 * Human-readable label for an action key, used by the Activity trail UI.
 * Unknown keys fall back to a de-dotted, de-underscored form of the key itself,
 * so a newly logged action is readable before it is listed here.
 */
export const ACTIVITY_LABELS: Record<string, string> = {
  'team.invite_sent':       'Invited a team member',
  'team.invite_revoked':    'Revoked an invitation',
  'team.member_joined':     'Joined the workspace',
  'team.role_changed':      'Changed a member’s role',
  'team.member_removed':    'Removed a team member',
  'team.member_suspended':  'Suspended a team member',
  'team.member_restored':   'Restored a team member',
  'team.access_changed':    'Changed a member’s page access',
  'team.page_access_changed': 'Changed workspace page access',
  'team.role_created':      'Created a custom role',
  'team.role_updated':      'Updated a custom role',
  'team.role_deleted':      'Deleted a custom role',
  'contact.owner_changed':  'Reassigned a client',
  // Written by the conversation endpoints, which have used these bare keys
  // since before the trail had labels.
  'assigned':               'Assigned a conversation',
  'unassigned':             'Unassigned a conversation',
  'status_changed':         'Changed a conversation’s status',
  'task.created':           'Created a task',
  'task.updated':           'Updated a task',
  'task.deleted':           'Deleted a task',
  'campaign.sent':          'Sent a campaign',
  'campaign.cancelled':     'Cancelled a campaign',
  'kb.created':             'Added a knowledge-base entry',
  'kb.updated':             'Updated a knowledge-base entry',
  'kb.deleted':             'Deleted a knowledge-base entry',
  'settings.updated':       'Updated workspace settings',
  'billing.checkout':       'Started a checkout',
  'template.submitted':     'Submitted a template for review',
};

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action]
    ?? action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

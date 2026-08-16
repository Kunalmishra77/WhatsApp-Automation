// Shared types for the platform-admin "Client Inboxes" UI.
// These mirror the shapes returned by the admin conversation endpoints:
//   GET  /api/admin/conversations
//   GET  /api/admin/conversations/[id]/messages
//   POST /api/admin/conversations/[id]/send

export interface AdminContact {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

// A conversation row as returned by GET /api/admin/conversations.
// The joined contact comes back under the `contacts` key (from the SELECT),
// though we read it defensively via `contactOf()` below.
export interface AdminConversation {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  status: string | null;
  channel: string | null;
  subject: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  is_pinned?: boolean | null;
  is_starred?: boolean | null;
  contacts?: AdminContact | null;
  contact?: AdminContact | null;
}

export interface AdminMessage {
  id: string;
  direction: 'inbound' | 'outbound' | string;
  content: string | null;
  type: string | null;
  created_at: string;
  sender_type: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
}

export interface AdminThreadConversation {
  id: string;
  workspace_id: string;
  channel: string | null;
  status: string | null;
  contact_id: string | null;
  contacts?: AdminContact | null;
}

// Normalizes the contact regardless of which key the API used.
export function contactOf(
  conv: { contacts?: AdminContact | null; contact?: AdminContact | null } | null | undefined,
): AdminContact | null {
  if (!conv) return null;
  return conv.contacts ?? conv.contact ?? null;
}

export function contactLabel(contact: AdminContact | null): string {
  if (!contact) return 'Unknown contact';
  return contact.name?.trim() || contact.phone || 'Unknown contact';
}

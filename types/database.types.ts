export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Enums ────────────────────────────────────────────
export type UserRole           = 'super_admin' | 'admin' | 'manager' | 'agent';
export type ConversationStatus = 'open' | 'assigned' | 'resolved' | 'pending' | 'snoozed';
export type MessageType        = 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'sticker' | 'interactive' | 'template' | 'internal_note';
export type MessageStatus      = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageDirection   = 'inbound' | 'outbound';
export type LeadStage          = 'new' | 'contacted' | 'follow_up' | 'interested' | 'converted' | 'lost';
export type CampaignStatus     = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';
export type TemplateStatus     = 'pending' | 'approved' | 'rejected' | 'paused';
export type TemplateCategory   = 'authentication' | 'marketing' | 'utility';

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; full_name: string; email: string; avatar_url: string | null;
          phone: string | null; timezone: string; preferences: Json;
          last_seen_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id: string; full_name?: string; email: string; avatar_url?: string | null;
          phone?: string | null; timezone?: string; preferences?: Json;
          last_seen_at?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: Rel[];
      };
      workspaces: {
        Row: {
          id: string; name: string; slug: string; logo_url: string | null; plan: string;
          waba_id: string | null; phone_number_id: string | null;
          access_token: string | null; webhook_secret: string | null;
          settings: Json; is_active: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; name: string; slug: string; logo_url?: string | null; plan?: string;
          waba_id?: string | null; phone_number_id?: string | null;
          access_token?: string | null; webhook_secret?: string | null;
          settings?: Json; is_active?: boolean; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
        Relationships: Rel[];
      };
      workspace_members: {
        Row: {
          id: string; workspace_id: string; user_id: string; role: UserRole;
          is_online: boolean; max_chats: number; joined_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; user_id: string; role?: UserRole;
          is_online?: boolean; max_chats?: number; joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
        Relationships: Rel[];
      };
      contacts: {
        Row: {
          id: string; workspace_id: string; phone: string; name: string | null;
          email: string | null; avatar_url: string | null; company: string | null;
          country: string | null; language: string; tags: string[];
          custom_fields: Json; is_blocked: boolean; opted_out: boolean;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; phone: string; name?: string | null;
          email?: string | null; avatar_url?: string | null; company?: string | null;
          country?: string | null; language?: string; tags?: string[];
          custom_fields?: Json; is_blocked?: boolean; opted_out?: boolean;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
        Relationships: Rel[];
      };
      conversations: {
        Row: {
          id: string; workspace_id: string; contact_id: string;
          assigned_agent_id: string | null; status: ConversationStatus;
          channel: string; subject: string | null; last_message: string | null;
          last_message_at: string | null; unread_count: number; labels: string[];
          is_pinned: boolean; is_starred: boolean; snoozed_until: string | null;
          resolved_at: string | null; meta: Json; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; contact_id: string;
          assigned_agent_id?: string | null; status?: ConversationStatus;
          channel?: string; subject?: string | null; last_message?: string | null;
          last_message_at?: string | null; unread_count?: number; labels?: string[];
          is_pinned?: boolean; is_starred?: boolean; snoozed_until?: string | null;
          resolved_at?: string | null; meta?: Json; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
        Relationships: Rel[];
      };
      messages: {
        Row: {
          id: string; conversation_id: string; workspace_id: string;
          sender_type: string; sender_id: string | null;
          direction: MessageDirection; type: MessageType;
          content: string | null; media_url: string | null;
          media_mime_type: string | null; media_size: number | null;
          media_filename: string | null; caption: string | null;
          whatsapp_msg_id: string | null; status: MessageStatus;
          is_deleted: boolean; reply_to_id: string | null;
          reactions: Json; metadata: Json;
          delivered_at: string | null; read_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; conversation_id: string; workspace_id: string;
          sender_type: string; sender_id?: string | null;
          direction: MessageDirection; type?: MessageType;
          content?: string | null; media_url?: string | null;
          media_mime_type?: string | null; media_size?: number | null;
          media_filename?: string | null; caption?: string | null;
          whatsapp_msg_id?: string | null; status?: MessageStatus;
          is_deleted?: boolean; reply_to_id?: string | null;
          reactions?: Json; metadata?: Json;
          delivered_at?: string | null; read_at?: string | null; created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: Rel[];
      };
      leads: {
        Row: {
          id: string; workspace_id: string; contact_id: string | null;
          conversation_id: string | null; assigned_agent_id: string | null;
          title: string; stage: LeadStage; value: number | null; currency: string;
          priority: string; source: string | null; notes: string | null;
          tags: string[]; custom_fields: Json;
          follow_up_at: string | null; closed_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; contact_id?: string | null;
          conversation_id?: string | null; assigned_agent_id?: string | null;
          title: string; stage?: LeadStage; value?: number | null; currency?: string;
          priority?: string; source?: string | null; notes?: string | null;
          tags?: string[]; custom_fields?: Json;
          follow_up_at?: string | null; closed_at?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['leads']['Insert']>;
        Relationships: Rel[];
      };
      templates: {
        Row: {
          id: string; workspace_id: string; name: string;
          category: TemplateCategory; language: string; status: TemplateStatus;
          header_type: string | null; header_content: string | null;
          body: string; footer: string | null; buttons: Json; variables: string[];
          meta_template_id: string | null; rejection_reason: string | null;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; name: string;
          category: TemplateCategory; language?: string; status?: TemplateStatus;
          header_type?: string | null; header_content?: string | null;
          body: string; footer?: string | null; buttons?: Json; variables?: string[];
          meta_template_id?: string | null; rejection_reason?: string | null;
          created_by?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['templates']['Insert']>;
        Relationships: Rel[];
      };
      campaigns: {
        Row: {
          id: string; workspace_id: string; name: string;
          template_id: string | null; status: CampaignStatus;
          audience_type: string | null; audience_filter: Json;
          total_recipients: number; sent_count: number;
          delivered_count: number; read_count: number; failed_count: number;
          scheduled_at: string | null; started_at: string | null;
          completed_at: string | null; created_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; name: string;
          template_id?: string | null; status?: CampaignStatus;
          audience_type?: string | null; audience_filter?: Json;
          total_recipients?: number; sent_count?: number;
          delivered_count?: number; read_count?: number; failed_count?: number;
          scheduled_at?: string | null; started_at?: string | null;
          completed_at?: string | null; created_by?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['campaigns']['Insert']>;
        Relationships: Rel[];
      };
      notifications: {
        Row: {
          id: string; workspace_id: string; user_id: string;
          type: string; title: string; body: string | null;
          data: Json; is_read: boolean; read_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; user_id: string;
          type: string; title: string; body?: string | null;
          data?: Json; is_read?: boolean; read_at?: string | null; created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: Rel[];
      };
      activities: {
        Row: {
          id: string; workspace_id: string; actor_id: string | null;
          entity_type: string; entity_id: string; action: string;
          metadata: Json; created_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; actor_id?: string | null;
          entity_type: string; entity_id: string; action: string;
          metadata?: Json; created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
        Relationships: Rel[];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean };
    };
    Enums: {
      user_role:           UserRole;
      conversation_status: ConversationStatus;
      message_type:        MessageType;
      message_status:      MessageStatus;
      message_direction:   MessageDirection;
      lead_stage:          LeadStage;
      campaign_status:     CampaignStatus;
      template_status:     TemplateStatus;
      template_category:   TemplateCategory;
    };
  };
}

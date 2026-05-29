export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'agent';

type Relationship = {
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
          id:           string;
          full_name:    string;
          email:        string;
          avatar_url:   string | null;
          phone:        string | null;
          timezone:     string;
          preferences:  Json;
          last_seen_at: string | null;
          created_at:   string;
          updated_at:   string;
        };
        Insert: {
          id:            string;
          full_name?:    string;
          email:         string;
          avatar_url?:   string | null;
          phone?:        string | null;
          timezone?:     string;
          preferences?:  Json;
          last_seen_at?: string | null;
          created_at?:   string;
          updated_at?:   string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: Relationship[];
      };
      workspaces: {
        Row: {
          id:              string;
          name:            string;
          slug:            string;
          logo_url:        string | null;
          plan:            string;
          waba_id:         string | null;
          phone_number_id: string | null;
          access_token:    string | null;
          webhook_secret:  string | null;
          settings:        Json;
          is_active:       boolean;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:              string;
          name:             string;
          slug:             string;
          logo_url?:        string | null;
          plan?:            string;
          waba_id?:         string | null;
          phone_number_id?: string | null;
          access_token?:    string | null;
          webhook_secret?:  string | null;
          settings?:        Json;
          is_active?:       boolean;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
        Relationships: Relationship[];
      };
      workspace_members: {
        Row: {
          id:           string;
          workspace_id: string;
          user_id:      string;
          role:         UserRole;
          is_online:    boolean;
          max_chats:    number;
          joined_at:    string;
        };
        Insert: {
          id?:          string;
          workspace_id: string;
          user_id:      string;
          role?:        UserRole;
          is_online?:   boolean;
          max_chats?:   number;
          joined_at?:   string;
        };
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
        Relationships: Relationship[];
      };
    };
    Views:     Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
    };
  };
}

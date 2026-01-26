export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      document_comments: {
        Row: {
          content: string
          created_at: string
          document_id: string
          id: string
          user_email: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          id?: string
          user_email: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          user_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_edit_history: {
        Row: {
          document_id: string
          edited_at: string
          edited_by: string | null
          edited_by_email: string
          id: string
          new_content: string
          new_status: string | null
          new_title: string | null
          previous_content: string
          previous_status: string | null
          previous_title: string | null
        }
        Insert: {
          document_id: string
          edited_at?: string
          edited_by?: string | null
          edited_by_email: string
          id?: string
          new_content: string
          new_status?: string | null
          new_title?: string | null
          previous_content: string
          previous_status?: string | null
          previous_title?: string | null
        }
        Update: {
          document_id?: string
          edited_at?: string
          edited_by?: string | null
          edited_by_email?: string
          id?: string
          new_content?: string
          new_status?: string | null
          new_title?: string | null
          previous_content?: string
          previous_status?: string | null
          previous_title?: string | null
        }
        Relationships: []
      }
      document_sections: {
        Row: {
          content: string
          created_at: string
          document_id: string
          id: string
          section_number: number
          status: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          id?: string
          section_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          section_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          created_by: string
          file_name: string | null
          file_url: string | null
          id: string
          notes: string | null
          original_content: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          created_by: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          original_content: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          original_content?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      linkedin_posts: {
        Row: {
          comments: number | null
          content: string | null
          created_at: string | null
          engagement_rate: number | null
          fetched_at: string | null
          id: string
          impressions: number | null
          linkedin_post_urn: string
          published_at: string | null
          publisher_id: string
          reactions: number | null
          reshares: number | null
        }
        Insert: {
          comments?: number | null
          content?: string | null
          created_at?: string | null
          engagement_rate?: number | null
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          linkedin_post_urn: string
          published_at?: string | null
          publisher_id: string
          reactions?: number | null
          reshares?: number | null
        }
        Update: {
          comments?: number | null
          content?: string | null
          created_at?: string | null
          engagement_rate?: number | null
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          linkedin_post_urn?: string
          published_at?: string | null
          publisher_id?: string
          reactions?: number | null
          reshares?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_posts_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      post_analytics_history: {
        Row: {
          comments: number | null
          created_at: string | null
          id: string
          impressions: number | null
          post_id: string
          reactions: number | null
          reshares: number | null
          snapshot_date: string
          unique_impressions: number | null
        }
        Insert: {
          comments?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          post_id: string
          reactions?: number | null
          reshares?: number | null
          snapshot_date: string
          unique_impressions?: number | null
        }
        Update: {
          comments?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          post_id?: string
          reactions?: number | null
          reshares?: number | null
          snapshot_date?: string
          unique_impressions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_analytics_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_name: string | null
          author_urn: string | null
          commented_at: string | null
          content: string | null
          created_at: string | null
          id: string
          linkedin_comment_urn: string | null
          parent_comment_id: string | null
          post_id: string
        }
        Insert: {
          author_name?: string | null
          author_urn?: string | null
          commented_at?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          linkedin_comment_urn?: string | null
          parent_comment_id?: string | null
          post_id: string
        }
        Update: {
          author_name?: string | null
          author_urn?: string | null
          commented_at?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          linkedin_comment_urn?: string | null
          parent_comment_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_edit_history: {
        Row: {
          edited_at: string
          edited_by: string | null
          edited_by_email: string
          id: string
          new_content: string
          new_status: string | null
          post_id: string
          previous_content: string
          previous_status: string | null
        }
        Insert: {
          edited_at?: string
          edited_by?: string | null
          edited_by_email: string
          id?: string
          new_content: string
          new_status?: string | null
          post_id: string
          previous_content: string
          previous_status?: string | null
        }
        Update: {
          edited_at?: string
          edited_by?: string | null
          edited_by_email?: string
          id?: string
          new_content?: string
          new_status?: string | null
          post_id?: string
          previous_content?: string
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_edit_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          analytics_fetched_at: string | null
          avg_reply_depth: number | null
          click_through_rate: number | null
          comments_count: number | null
          content: string
          created_at: string
          created_by: string
          document_id: string | null
          engagement_rate: number | null
          id: string
          impressions: number | null
          labels: string[] | null
          link_clicks: number | null
          linkedin_post_url: string | null
          linkedin_post_urn: string | null
          linkedin_url: string | null
          media_urns: string[] | null
          post_type: string | null
          publish_method: string | null
          published_at: string | null
          publisher_name: string
          publisher_role: string | null
          reaction_celebrate: number | null
          reaction_curious: number | null
          reaction_insightful: number | null
          reaction_like: number | null
          reaction_love: number | null
          reaction_support: number | null
          reactions: number | null
          reshares: number | null
          scheduled_date: string
          status: string
          thread_count: number | null
          unique_impressions: number | null
          updated_at: string
          video_completion_rate: number | null
          video_milestone_100: number | null
          video_milestone_25: number | null
          video_milestone_50: number | null
          video_milestone_75: number | null
          video_unique_viewers: number | null
          video_views: number | null
          video_watch_time_seconds: number | null
        }
        Insert: {
          analytics_fetched_at?: string | null
          avg_reply_depth?: number | null
          click_through_rate?: number | null
          comments_count?: number | null
          content: string
          created_at?: string
          created_by: string
          document_id?: string | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          labels?: string[] | null
          link_clicks?: number | null
          linkedin_post_url?: string | null
          linkedin_post_urn?: string | null
          linkedin_url?: string | null
          media_urns?: string[] | null
          post_type?: string | null
          publish_method?: string | null
          published_at?: string | null
          publisher_name: string
          publisher_role?: string | null
          reaction_celebrate?: number | null
          reaction_curious?: number | null
          reaction_insightful?: number | null
          reaction_like?: number | null
          reaction_love?: number | null
          reaction_support?: number | null
          reactions?: number | null
          reshares?: number | null
          scheduled_date?: string
          status?: string
          thread_count?: number | null
          unique_impressions?: number | null
          updated_at?: string
          video_completion_rate?: number | null
          video_milestone_100?: number | null
          video_milestone_25?: number | null
          video_milestone_50?: number | null
          video_milestone_75?: number | null
          video_unique_viewers?: number | null
          video_views?: number | null
          video_watch_time_seconds?: number | null
        }
        Update: {
          analytics_fetched_at?: string | null
          avg_reply_depth?: number | null
          click_through_rate?: number | null
          comments_count?: number | null
          content?: string
          created_at?: string
          created_by?: string
          document_id?: string | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          labels?: string[] | null
          link_clicks?: number | null
          linkedin_post_url?: string | null
          linkedin_post_urn?: string | null
          linkedin_url?: string | null
          media_urns?: string[] | null
          post_type?: string | null
          publish_method?: string | null
          published_at?: string | null
          publisher_name?: string
          publisher_role?: string | null
          reaction_celebrate?: number | null
          reaction_curious?: number | null
          reaction_insightful?: number | null
          reaction_like?: number | null
          reaction_love?: number | null
          reaction_support?: number | null
          reactions?: number | null
          reshares?: number | null
          scheduled_date?: string
          status?: string
          thread_count?: number | null
          unique_impressions?: number | null
          updated_at?: string
          video_completion_rate?: number | null
          video_milestone_100?: number | null
          video_milestone_25?: number | null
          video_milestone_50?: number | null
          video_milestone_75?: number | null
          video_unique_viewers?: number | null
          video_views?: number | null
          video_watch_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      publishers: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          linkedin_access_token: string | null
          linkedin_connected: boolean | null
          linkedin_member_id: string | null
          linkedin_refresh_token: string | null
          linkedin_token_expires_at: string | null
          linkedin_url: string | null
          name: string
          role: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          linkedin_access_token?: string | null
          linkedin_connected?: boolean | null
          linkedin_member_id?: string | null
          linkedin_refresh_token?: string | null
          linkedin_token_expires_at?: string | null
          linkedin_url?: string | null
          name: string
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          linkedin_access_token?: string | null
          linkedin_connected?: boolean | null
          linkedin_member_id?: string | null
          linkedin_refresh_token?: string | null
          linkedin_token_expires_at?: string | null
          linkedin_url?: string | null
          name?: string
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      section_edit_history: {
        Row: {
          document_id: string
          edited_at: string
          edited_by: string | null
          edited_by_email: string
          id: string
          new_content: string
          new_status: string | null
          previous_content: string
          previous_status: string | null
          section_id: string
        }
        Insert: {
          document_id: string
          edited_at?: string
          edited_by?: string | null
          edited_by_email: string
          id?: string
          new_content: string
          new_status?: string | null
          previous_content: string
          previous_status?: string | null
          section_id: string
        }
        Update: {
          document_id?: string
          edited_at?: string
          edited_by?: string | null
          edited_by_email?: string
          id?: string
          new_content?: string
          new_status?: string | null
          previous_content?: string
          previous_status?: string | null
          section_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const

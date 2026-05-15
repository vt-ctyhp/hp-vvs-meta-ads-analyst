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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_analysis_dashboards: {
        Row: {
          created_at: string
          id: string
          mode: string
          model_analysis: string | null
          model_plan: string
          prompt: string
          source_transparency: Json
          spec: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          model_analysis?: string | null
          model_plan: string
          prompt: string
          source_transparency?: Json
          spec: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          model_analysis?: string | null
          model_plan?: string
          prompt?: string
          source_transparency?: Json
          spec?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_analysis_runs: {
        Row: {
          created_at: string
          dashboard_id: string | null
          id: string
          mode: string
          model_analysis: string | null
          model_plan: string
          prompt: string
          result_preview: Json
          source_transparency: Json
          token_estimate: Json
        }
        Insert: {
          created_at?: string
          dashboard_id?: string | null
          id?: string
          mode?: string
          model_analysis?: string | null
          model_plan: string
          prompt: string
          result_preview?: Json
          source_transparency?: Json
          token_estimate?: Json
        }
        Update: {
          created_at?: string
          dashboard_id?: string | null
          id?: string
          mode?: string
          model_analysis?: string | null
          model_plan?: string
          prompt?: string
          result_preview?: Json
          source_transparency?: Json
          token_estimate?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_runs_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "ai_analysis_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          source_transparency: Json
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          source_transparency?: Json
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          source_transparency?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_reply_suggestions: {
        Row: {
          brand: string
          comment_id: string | null
          context_used: Json
          created_at: string
          draft: string
          id: string
          language: string
          model: string
          platform: string
          prompt_version: number | null
          source_type: string
          status: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          brand: string
          comment_id?: string | null
          context_used?: Json
          created_at?: string
          draft: string
          id?: string
          language: string
          model: string
          platform: string
          prompt_version?: number | null
          source_type: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string
          comment_id?: string | null
          context_used?: Json
          created_at?: string
          draft?: string
          id?: string
          language?: string
          model?: string
          platform?: string
          prompt_version?: number | null
          source_type?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_reports: {
        Row: {
          ad_account_ids: Json
          content: Json
          created_at: string
          generated_at: string
          id: string
          model: string
          record_counts: Json
          report_type: string
          source_transparency: Json
          time_range: Json
          title: string
        }
        Insert: {
          ad_account_ids?: Json
          content: Json
          created_at?: string
          generated_at?: string
          id?: string
          model: string
          record_counts?: Json
          report_type?: string
          source_transparency?: Json
          time_range: Json
          title: string
        }
        Update: {
          ad_account_ids?: Json
          content?: Json
          created_at?: string
          generated_at?: string
          id?: string
          model?: string
          record_counts?: Json
          report_type?: string
          source_transparency?: Json
          time_range?: Json
          title?: string
        }
        Relationships: []
      }
      appointment_artifacts: {
        Row: {
          analysis_group_id: string | null
          approved_at: string | null
          approved_by: string | null
          appt_id: string
          artifact_id: string
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          assemblyai_transcript_id: string | null
          attempts: number
          canonical_filename: string | null
          client_follow_up_draft: string | null
          created_at: string
          file_size_bytes: number | null
          id: string
          joc_handoff_at: string | null
          joc_handoff_by: string | null
          last_attempt_at: string | null
          last_error: string | null
          mime_type: string | null
          original_filename: string | null
          review_flags: Json | null
          root_id: string
          sales_brief: string | null
          storage_asset_id: string | null
          summary_json: Json | null
          summary_storage_asset_id: string | null
          transcript_storage_asset_id: string | null
          transcript_text: string | null
          updated_at: string
          version: number
          workflow_stage: Database["public"]["Enums"]["artifact_workflow_stage"]
        }
        Insert: {
          analysis_group_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          appt_id: string
          artifact_id: string
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          assemblyai_transcript_id?: string | null
          attempts?: number
          canonical_filename?: string | null
          client_follow_up_draft?: string | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          joc_handoff_at?: string | null
          joc_handoff_by?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          mime_type?: string | null
          original_filename?: string | null
          review_flags?: Json | null
          root_id: string
          sales_brief?: string | null
          storage_asset_id?: string | null
          summary_json?: Json | null
          summary_storage_asset_id?: string | null
          transcript_storage_asset_id?: string | null
          transcript_text?: string | null
          updated_at?: string
          version?: number
          workflow_stage?: Database["public"]["Enums"]["artifact_workflow_stage"]
        }
        Update: {
          analysis_group_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          appt_id?: string
          artifact_id?: string
          artifact_type?: Database["public"]["Enums"]["artifact_type"]
          assemblyai_transcript_id?: string | null
          attempts?: number
          canonical_filename?: string | null
          client_follow_up_draft?: string | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          joc_handoff_at?: string | null
          joc_handoff_by?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          mime_type?: string | null
          original_filename?: string | null
          review_flags?: Json | null
          root_id?: string
          sales_brief?: string | null
          storage_asset_id?: string | null
          summary_json?: Json | null
          summary_storage_asset_id?: string | null
          transcript_storage_asset_id?: string | null
          transcript_text?: string | null
          updated_at?: string
          version?: number
          workflow_stage?: Database["public"]["Enums"]["artifact_workflow_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_artifacts_analysis_group_id_fkey"
            columns: ["analysis_group_id"]
            isOneToOne: false
            referencedRelation: "recording_analysis_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_artifacts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointment_artifacts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_artifacts_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_artifacts_joc_handoff_by_fkey"
            columns: ["joc_handoff_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointment_artifacts_joc_handoff_by_fkey"
            columns: ["joc_handoff_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_artifacts_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_artifacts_storage_asset_fkey"
            columns: ["storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_artifacts_summary_storage_asset_fkey"
            columns: ["summary_storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_artifacts_transcript_storage_asset_fkey"
            columns: ["transcript_storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_events: {
        Row: {
          active: boolean
          appt_id: string
          booked_at: string | null
          booking_source: Database["public"]["Enums"]["booking_source"]
          brand: Database["public"]["Enums"]["brand"]
          canceled_at: string | null
          completed_at: string | null
          created_at: string
          duration_minutes: number | null
          external_booking_id: string | null
          external_rescheduled_from_id: string | null
          id: string
          location: string | null
          no_show_at: string | null
          outcome: string | null
          outcome_notes: string | null
          raw_payload: Json | null
          rescheduled_at: string | null
          rescheduled_from_event_id: string | null
          rescheduled_to_event_id: string | null
          root_id: string
          source: string | null
          status: string
          updated_at: string
          version: number
          visit_date_time: string | null
          visit_type: string | null
        }
        Insert: {
          active?: boolean
          appt_id: string
          booked_at?: string | null
          booking_source: Database["public"]["Enums"]["booking_source"]
          brand: Database["public"]["Enums"]["brand"]
          canceled_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          external_booking_id?: string | null
          external_rescheduled_from_id?: string | null
          id?: string
          location?: string | null
          no_show_at?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          raw_payload?: Json | null
          rescheduled_at?: string | null
          rescheduled_from_event_id?: string | null
          rescheduled_to_event_id?: string | null
          root_id: string
          source?: string | null
          status?: string
          updated_at?: string
          version?: number
          visit_date_time?: string | null
          visit_type?: string | null
        }
        Update: {
          active?: boolean
          appt_id?: string
          booked_at?: string | null
          booking_source?: Database["public"]["Enums"]["booking_source"]
          brand?: Database["public"]["Enums"]["brand"]
          canceled_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          external_booking_id?: string | null
          external_rescheduled_from_id?: string | null
          id?: string
          location?: string | null
          no_show_at?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          raw_payload?: Json | null
          rescheduled_at?: string | null
          rescheduled_from_event_id?: string | null
          rescheduled_to_event_id?: string | null
          root_id?: string
          source?: string | null
          status?: string
          updated_at?: string
          version?: number
          visit_date_time?: string | null
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_events_rescheduled_from_event_id_fkey"
            columns: ["rescheduled_from_event_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_events_rescheduled_to_event_id_fkey"
            columns: ["rescheduled_to_event_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_events_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_notice_reads: {
        Row: {
          notice_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notice_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notice_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notice_reads_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "appointment_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_notice_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointment_notice_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_notices: {
        Row: {
          acknowledged_by_advisor_at: string | null
          acknowledged_by_joc_at: string | null
          appt_id: string | null
          brand: Database["public"]["Enums"]["brand"]
          customer_name: string
          id: string
          issued_at: string
          issued_by: string
          new_appt_date_time: string | null
          notice_id: string
          notice_type: Database["public"]["Enums"]["notice_type"]
          prior_appt_date_time: string | null
          root_id: string
          target_advisor_id: string | null
          target_joc_id: string | null
          target_queue_label: string | null
          target_role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          acknowledged_by_advisor_at?: string | null
          acknowledged_by_joc_at?: string | null
          appt_id?: string | null
          brand: Database["public"]["Enums"]["brand"]
          customer_name: string
          id?: string
          issued_at?: string
          issued_by: string
          new_appt_date_time?: string | null
          notice_id: string
          notice_type: Database["public"]["Enums"]["notice_type"]
          prior_appt_date_time?: string | null
          root_id: string
          target_advisor_id?: string | null
          target_joc_id?: string | null
          target_queue_label?: string | null
          target_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          acknowledged_by_advisor_at?: string | null
          acknowledged_by_joc_at?: string | null
          appt_id?: string | null
          brand?: Database["public"]["Enums"]["brand"]
          customer_name?: string
          id?: string
          issued_at?: string
          issued_by?: string
          new_appt_date_time?: string | null
          notice_id?: string
          notice_type?: Database["public"]["Enums"]["notice_type"]
          prior_appt_date_time?: string | null
          root_id?: string
          target_advisor_id?: string | null
          target_joc_id?: string | null
          target_queue_label?: string | null
          target_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notices_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_notices_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_notices_target_advisor_id_fkey"
            columns: ["target_advisor_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointment_notices_target_advisor_id_fkey"
            columns: ["target_advisor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_notices_target_joc_id_fkey"
            columns: ["target_joc_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointment_notices_target_joc_id_fkey"
            columns: ["target_joc_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_read_model_import_staging: {
        Row: {
          active: boolean
          appt_id: string | null
          booked_at: string | null
          brand: Database["public"]["Enums"]["brand"]
          canceled_at: string | null
          center_stone_status: string | null
          client_advisor: string | null
          client_advisor_email: string | null
          client_folder_url: string | null
          client_status_report_url: string | null
          conversion_status: string | null
          custom_order_status: string | null
          customer_name: string | null
          deadline_3d: string | null
          design_request: string | null
          diamond_type: string | null
          dv_stones_summary: string | null
          email: string | null
          event_appt_id: string
          import_batch_id: string
          in_production_status: string | null
          include_in_active_import: boolean
          joc: string | null
          joc_email: string | null
          logistics_status: string | null
          next_steps: string | null
          phone: string | null
          production_deadline: string | null
          quotation_url: string | null
          rescheduled_from_uid: string | null
          rescheduled_to_uid: string | null
          root_appt_id: string
          sales_stage: string | null
          source_active: boolean
          source_row_id: number | null
          source_row_json: Json
          source_row_number: number
          source_sheet: string
          source_uid: string | null
          source_workbook: string
          staged_at: string
          status: string
          tracker_3d_url: string | null
          updated_at: string
          visit_at: string | null
          visit_date: string | null
          visit_time: string | null
          visit_type: string | null
          wax_deadline_admin: string | null
          wax_print_status: string | null
          wax_request_url: string | null
        }
        Insert: {
          active?: boolean
          appt_id?: string | null
          booked_at?: string | null
          brand: Database["public"]["Enums"]["brand"]
          canceled_at?: string | null
          center_stone_status?: string | null
          client_advisor?: string | null
          client_advisor_email?: string | null
          client_folder_url?: string | null
          client_status_report_url?: string | null
          conversion_status?: string | null
          custom_order_status?: string | null
          customer_name?: string | null
          deadline_3d?: string | null
          design_request?: string | null
          diamond_type?: string | null
          dv_stones_summary?: string | null
          email?: string | null
          event_appt_id: string
          import_batch_id: string
          in_production_status?: string | null
          include_in_active_import?: boolean
          joc?: string | null
          joc_email?: string | null
          logistics_status?: string | null
          next_steps?: string | null
          phone?: string | null
          production_deadline?: string | null
          quotation_url?: string | null
          rescheduled_from_uid?: string | null
          rescheduled_to_uid?: string | null
          root_appt_id: string
          sales_stage?: string | null
          source_active?: boolean
          source_row_id?: number | null
          source_row_json?: Json
          source_row_number: number
          source_sheet?: string
          source_uid?: string | null
          source_workbook: string
          staged_at?: string
          status: string
          tracker_3d_url?: string | null
          updated_at?: string
          visit_at?: string | null
          visit_date?: string | null
          visit_time?: string | null
          visit_type?: string | null
          wax_deadline_admin?: string | null
          wax_print_status?: string | null
          wax_request_url?: string | null
        }
        Update: {
          active?: boolean
          appt_id?: string | null
          booked_at?: string | null
          brand?: Database["public"]["Enums"]["brand"]
          canceled_at?: string | null
          center_stone_status?: string | null
          client_advisor?: string | null
          client_advisor_email?: string | null
          client_folder_url?: string | null
          client_status_report_url?: string | null
          conversion_status?: string | null
          custom_order_status?: string | null
          customer_name?: string | null
          deadline_3d?: string | null
          design_request?: string | null
          diamond_type?: string | null
          dv_stones_summary?: string | null
          email?: string | null
          event_appt_id?: string
          import_batch_id?: string
          in_production_status?: string | null
          include_in_active_import?: boolean
          joc?: string | null
          joc_email?: string | null
          logistics_status?: string | null
          next_steps?: string | null
          phone?: string | null
          production_deadline?: string | null
          quotation_url?: string | null
          rescheduled_from_uid?: string | null
          rescheduled_to_uid?: string | null
          root_appt_id?: string
          sales_stage?: string | null
          source_active?: boolean
          source_row_id?: number | null
          source_row_json?: Json
          source_row_number?: number
          source_sheet?: string
          source_uid?: string | null
          source_workbook?: string
          staged_at?: string
          status?: string
          tracker_3d_url?: string | null
          updated_at?: string
          visit_at?: string | null
          visit_date?: string | null
          visit_time?: string | null
          visit_type?: string | null
          wax_deadline_admin?: string | null
          wax_print_status?: string | null
          wax_request_url?: string | null
        }
        Relationships: []
      }
      brand_voice_guidelines: {
        Row: {
          active: boolean
          brand: string
          created_at: string
          full_guideline: string
          id: string
          language: string
          runtime_prompt: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          brand: string
          created_at?: string
          full_guideline: string
          id?: string
          language: string
          runtime_prompt: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          brand?: string
          created_at?: string
          full_guideline?: string
          id?: string
          language?: string
          runtime_prompt?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      brands: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_reads: {
        Row: {
          broadcast_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_reads_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_reads_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "user_visible_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "broadcast_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_targets: {
        Row: {
          broadcast_id: string
          id: string
          target_role: Database["public"]["Enums"]["user_role"] | null
          target_type: Database["public"]["Enums"]["broadcast_target_type"]
          target_user_id: string | null
        }
        Insert: {
          broadcast_id: string
          id?: string
          target_role?: Database["public"]["Enums"]["user_role"] | null
          target_type: Database["public"]["Enums"]["broadcast_target_type"]
          target_user_id?: string | null
        }
        Update: {
          broadcast_id?: string
          id?: string
          target_role?: Database["public"]["Enums"]["user_role"] | null
          target_type?: Database["public"]["Enums"]["broadcast_target_type"]
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_targets_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_targets_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "user_visible_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_targets_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "broadcast_targets_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body: string
          broadcast_id: string
          expires_at: string | null
          id: string
          priority: Database["public"]["Enums"]["broadcast_priority"]
          sent_at: string
          sent_by: string
          subject: string
        }
        Insert: {
          body: string
          broadcast_id: string
          expires_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["broadcast_priority"]
          sent_at?: string
          sent_by: string
          subject: string
        }
        Update: {
          body?: string
          broadcast_id?: string
          expires_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["broadcast_priority"]
          sent_at?: string
          sent_by?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_umbrella_overrides: {
        Row: {
          campaign_umbrella: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          meta_account_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          campaign_umbrella: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          meta_account_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          campaign_umbrella?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          meta_account_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_status: {
        Row: {
          center_stone_status: string | null
          conversion_status: string | null
          created_at: string
          created_by: string | null
          custom_order_status: string | null
          deadline_3d: string | null
          deadline_3d_move_count: number
          deadline_3d_updated_at: string | null
          deadline_3d_updated_by: string | null
          id: string
          in_production_status: string | null
          logistics_status: string | null
          lost_lead_notes: string | null
          lost_lead_reason: string | null
          next_steps: string | null
          order_date: string | null
          order_total: number
          paid_to_date: number
          production_deadline: string | null
          production_deadline_move_count: number
          remaining_balance: number
          root_id: string
          sales_stage: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          center_stone_status?: string | null
          conversion_status?: string | null
          created_at?: string
          created_by?: string | null
          custom_order_status?: string | null
          deadline_3d?: string | null
          deadline_3d_move_count?: number
          deadline_3d_updated_at?: string | null
          deadline_3d_updated_by?: string | null
          id?: string
          in_production_status?: string | null
          logistics_status?: string | null
          lost_lead_notes?: string | null
          lost_lead_reason?: string | null
          next_steps?: string | null
          order_date?: string | null
          order_total?: number
          paid_to_date?: number
          production_deadline?: string | null
          production_deadline_move_count?: number
          remaining_balance?: number
          root_id: string
          sales_stage?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          center_stone_status?: string | null
          conversion_status?: string | null
          created_at?: string
          created_by?: string | null
          custom_order_status?: string | null
          deadline_3d?: string | null
          deadline_3d_move_count?: number
          deadline_3d_updated_at?: string | null
          deadline_3d_updated_by?: string | null
          id?: string
          in_production_status?: string | null
          logistics_status?: string | null
          lost_lead_notes?: string | null
          lost_lead_reason?: string | null
          next_steps?: string | null
          order_date?: string | null
          order_total?: number
          paid_to_date?: number
          production_deadline?: string | null
          production_deadline_move_count?: number
          remaining_balance?: number
          root_id?: string
          sales_stage?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_status_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_status_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_deadline_3d_updated_by_fkey"
            columns: ["deadline_3d_updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_status_deadline_3d_updated_by_fkey"
            columns: ["deadline_3d_updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: true
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_status_history: {
        Row: {
          changed_at: string
          changed_by: string
          changed_field: string
          id: string
          new_value: string | null
          previous_value: string | null
          reason: string | null
          root_id: string
          source: string | null
          task_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          changed_field: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
          root_id: string
          source?: string | null
          task_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          changed_field?: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
          root_id?: string
          source?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_history_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          description: string | null
          key: string
          section: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          section: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          section?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_info: {
        Row: {
          address: string | null
          brand: Database["public"]["Enums"]["brand"]
          budget_range: string | null
          client_advisor_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          diamond_type: string | null
          email: string | null
          email_lower: string | null
          first_name: string | null
          id: string
          joc_id: string | null
          last_name: string | null
          marketing_source: string | null
          phone: string | null
          phone_normalized: string | null
          reference_links: string | null
          root_id: string
          style_notes: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address?: string | null
          brand: Database["public"]["Enums"]["brand"]
          budget_range?: string | null
          client_advisor_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          diamond_type?: string | null
          email?: string | null
          email_lower?: string | null
          first_name?: string | null
          id?: string
          joc_id?: string | null
          last_name?: string | null
          marketing_source?: string | null
          phone?: string | null
          phone_normalized?: string | null
          reference_links?: string | null
          root_id: string
          style_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          brand?: Database["public"]["Enums"]["brand"]
          budget_range?: string | null
          client_advisor_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          diamond_type?: string | null
          email?: string | null
          email_lower?: string | null
          first_name?: string | null
          id?: string
          joc_id?: string | null
          last_name?: string | null
          marketing_source?: string | null
          phone?: string | null
          phone_normalized?: string | null
          reference_links?: string | null
          root_id?: string
          style_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_info_client_advisor_id_fkey"
            columns: ["client_advisor_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customer_info_client_advisor_id_fkey"
            columns: ["client_advisor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_info_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customer_info_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_info_joc_id_fkey"
            columns: ["joc_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customer_info_joc_id_fkey"
            columns: ["joc_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_info_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: true
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_info_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customer_info_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_purge_runs: {
        Row: {
          actor_user_id: string | null
          completed_at: string | null
          customer_code: string
          customer_id: string
          customer_name: string | null
          db_purged_at: string | null
          error: string | null
          id: string
          options: Json
          preview: Json
          reason: string
          requested_at: string
          root_appt_ids: string[]
          root_ids: string[]
          status: string
          storage_delete_failures: Json
          storage_deleted_at: string | null
          storage_manifest: Json
          updated_at: string
          version: number
        }
        Insert: {
          actor_user_id?: string | null
          completed_at?: string | null
          customer_code: string
          customer_id: string
          customer_name?: string | null
          db_purged_at?: string | null
          error?: string | null
          id?: string
          options?: Json
          preview?: Json
          reason: string
          requested_at?: string
          root_appt_ids?: string[]
          root_ids?: string[]
          status: string
          storage_delete_failures?: Json
          storage_deleted_at?: string | null
          storage_manifest?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          actor_user_id?: string | null
          completed_at?: string | null
          customer_code?: string
          customer_id?: string
          customer_name?: string | null
          db_purged_at?: string | null
          error?: string | null
          id?: string
          options?: Json
          preview?: Json
          reason?: string
          requested_at?: string
          root_appt_ids?: string[]
          root_ids?: string[]
          status?: string
          storage_delete_failures?: Json
          storage_deleted_at?: string | null
          storage_manifest?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      customer_read_model_import_staging: {
        Row: {
          active: boolean
          active_appointment_count: number | null
          appointment_count: number | null
          brand: Database["public"]["Enums"]["brand"]
          budget_range: string | null
          center_stone_status: string | null
          client_advisor: string | null
          client_advisor_email: string | null
          client_folder_url: string | null
          client_status_report_url: string | null
          conversion_status: string | null
          custom_order_status: string | null
          customer_name: string
          deadline_3d: string | null
          design_request: string | null
          dv_stones_summary: string | null
          email: string | null
          import_batch_id: string
          in_production_status: string | null
          include_in_active_import: boolean
          joc: string | null
          joc_email: string | null
          last_payment_date: string | null
          last_visit: string | null
          latest_appt_id: string | null
          latest_visit_at: string | null
          latest_visit_date: string | null
          latest_visit_time: string | null
          latest_visit_type: string | null
          logistics_status: string | null
          master_row: string | null
          next_steps: string | null
          next_visit: string | null
          order_total: number | null
          paid_to_date: number | null
          phone: string | null
          production_deadline: string | null
          quotation_url: string | null
          remaining_balance: number | null
          root_appt_id: string
          sales_stage: string | null
          search_text: string | null
          so_number: string | null
          source: string | null
          source_row_json: Json
          source_row_number: number
          source_rows_json: Json | null
          source_sheet: string
          source_updated_at: string | null
          source_workbook: string
          stage_key: string | null
          stage_label: string | null
          staged_at: string
          style_notes: string | null
          tracker_3d_url: string | null
          updated_at: string
          wax_deadline_admin: string | null
          wax_print_status: string | null
        }
        Insert: {
          active: boolean
          active_appointment_count?: number | null
          appointment_count?: number | null
          brand: Database["public"]["Enums"]["brand"]
          budget_range?: string | null
          center_stone_status?: string | null
          client_advisor?: string | null
          client_advisor_email?: string | null
          client_folder_url?: string | null
          client_status_report_url?: string | null
          conversion_status?: string | null
          custom_order_status?: string | null
          customer_name: string
          deadline_3d?: string | null
          design_request?: string | null
          dv_stones_summary?: string | null
          email?: string | null
          import_batch_id: string
          in_production_status?: string | null
          include_in_active_import?: boolean
          joc?: string | null
          joc_email?: string | null
          last_payment_date?: string | null
          last_visit?: string | null
          latest_appt_id?: string | null
          latest_visit_at?: string | null
          latest_visit_date?: string | null
          latest_visit_time?: string | null
          latest_visit_type?: string | null
          logistics_status?: string | null
          master_row?: string | null
          next_steps?: string | null
          next_visit?: string | null
          order_total?: number | null
          paid_to_date?: number | null
          phone?: string | null
          production_deadline?: string | null
          quotation_url?: string | null
          remaining_balance?: number | null
          root_appt_id: string
          sales_stage?: string | null
          search_text?: string | null
          so_number?: string | null
          source?: string | null
          source_row_json?: Json
          source_row_number: number
          source_rows_json?: Json | null
          source_sheet?: string
          source_updated_at?: string | null
          source_workbook: string
          stage_key?: string | null
          stage_label?: string | null
          staged_at?: string
          style_notes?: string | null
          tracker_3d_url?: string | null
          updated_at?: string
          wax_deadline_admin?: string | null
          wax_print_status?: string | null
        }
        Update: {
          active?: boolean
          active_appointment_count?: number | null
          appointment_count?: number | null
          brand?: Database["public"]["Enums"]["brand"]
          budget_range?: string | null
          center_stone_status?: string | null
          client_advisor?: string | null
          client_advisor_email?: string | null
          client_folder_url?: string | null
          client_status_report_url?: string | null
          conversion_status?: string | null
          custom_order_status?: string | null
          customer_name?: string
          deadline_3d?: string | null
          design_request?: string | null
          dv_stones_summary?: string | null
          email?: string | null
          import_batch_id?: string
          in_production_status?: string | null
          include_in_active_import?: boolean
          joc?: string | null
          joc_email?: string | null
          last_payment_date?: string | null
          last_visit?: string | null
          latest_appt_id?: string | null
          latest_visit_at?: string | null
          latest_visit_date?: string | null
          latest_visit_time?: string | null
          latest_visit_type?: string | null
          logistics_status?: string | null
          master_row?: string | null
          next_steps?: string | null
          next_visit?: string | null
          order_total?: number | null
          paid_to_date?: number | null
          phone?: string | null
          production_deadline?: string | null
          quotation_url?: string | null
          remaining_balance?: number | null
          root_appt_id?: string
          sales_stage?: string | null
          search_text?: string | null
          so_number?: string | null
          source?: string | null
          source_row_json?: Json
          source_row_number?: number
          source_rows_json?: Json | null
          source_sheet?: string
          source_updated_at?: string | null
          source_workbook?: string
          stage_key?: string | null
          stage_label?: string | null
          staged_at?: string
          style_notes?: string | null
          tracker_3d_url?: string | null
          updated_at?: string
          wax_deadline_admin?: string | null
          wax_print_status?: string | null
        }
        Relationships: []
      }
      customer_read_model_owner_aliases: {
        Row: {
          alias: string
          created_at: string
          email: string
          owner_role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          version: number
        }
        Insert: {
          alias: string
          created_at?: string
          email: string
          owner_role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          version?: number
        }
        Update: {
          alias?: string
          created_at?: string
          email?: string
          owner_role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          customer_code: string
          id: string
          is_test: boolean
          test_marked_at: string | null
          test_marked_by: string | null
          test_marked_reason: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          customer_code: string
          id?: string
          is_test?: boolean
          test_marked_at?: string | null
          test_marked_by?: string | null
          test_marked_reason?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          customer_code?: string
          id?: string
          is_test?: boolean
          test_marked_at?: string | null
          test_marked_by?: string | null
          test_marked_reason?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_test_marked_by_fkey"
            columns: ["test_marked_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customers_test_marked_by_fkey"
            columns: ["test_marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      data_cleanup_cases: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          case_id: string
          created_at: string
          id: string
          proposal: Json | null
          proposed_at: string | null
          proposed_by: string | null
          return_reason: string | null
          root_id: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          case_id: string
          created_at?: string
          id?: string
          proposal?: Json | null
          proposed_at?: string | null
          proposed_by?: string | null
          return_reason?: string | null
          root_id: string
          status: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string
          created_at?: string
          id?: string
          proposal?: Json | null
          proposed_at?: string | null
          proposed_by?: string | null
          return_reason?: string | null
          root_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_cleanup_cases_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "data_cleanup_cases_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_cleanup_cases_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "data_cleanup_cases_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_cleanup_cases_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      design_assets: {
        Row: {
          aspect_ratio: number | null
          blur_score: number | null
          created_at: string
          created_by: string | null
          duplicate_of: string | null
          height_px: number | null
          id: string
          included_by_default: boolean
          perceptual_hash: string | null
          quality_flags: Json
          root_id: string
          storage_asset_id: string
          suggested_position: number | null
          width_px: number | null
        }
        Insert: {
          aspect_ratio?: number | null
          blur_score?: number | null
          created_at?: string
          created_by?: string | null
          duplicate_of?: string | null
          height_px?: number | null
          id?: string
          included_by_default?: boolean
          perceptual_hash?: string | null
          quality_flags?: Json
          root_id: string
          storage_asset_id: string
          suggested_position?: number | null
          width_px?: number | null
        }
        Update: {
          aspect_ratio?: number | null
          blur_score?: number | null
          created_at?: string
          created_by?: string | null
          duplicate_of?: string | null
          height_px?: number | null
          id?: string
          included_by_default?: boolean
          perceptual_hash?: string | null
          quality_flags?: Json
          root_id?: string
          storage_asset_id?: string
          suggested_position?: number | null
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_assets_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "design_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_assets_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_assets_storage_asset_id_fkey"
            columns: ["storage_asset_id"]
            isOneToOne: true
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      design_deck_slides: {
        Row: {
          caption: string | null
          created_at: string
          deck_id: string
          id: string
          layout: Database["public"]["Enums"]["design_slide_layout"]
          position: number
          primary_design_asset_id: string | null
          secondary_design_asset_id: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          deck_id: string
          id?: string
          layout: Database["public"]["Enums"]["design_slide_layout"]
          position: number
          primary_design_asset_id?: string | null
          secondary_design_asset_id?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          deck_id?: string
          id?: string
          layout?: Database["public"]["Enums"]["design_slide_layout"]
          position?: number
          primary_design_asset_id?: string | null
          secondary_design_asset_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_deck_slides_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "design_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_deck_slides_primary_design_asset_id_fkey"
            columns: ["primary_design_asset_id"]
            isOneToOne: false
            referencedRelation: "design_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_deck_slides_secondary_design_asset_id_fkey"
            columns: ["secondary_design_asset_id"]
            isOneToOne: false
            referencedRelation: "design_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      design_deck_versions: {
        Row: {
          deck_id: string
          id: string
          pdf_storage_asset_id: string | null
          pptx_storage_asset_id: string | null
          published_at: string | null
          published_by: string | null
          revoked_at: string | null
          share_token_hash: string | null
          slide_snapshot: Json
          version_number: number
        }
        Insert: {
          deck_id: string
          id?: string
          pdf_storage_asset_id?: string | null
          pptx_storage_asset_id?: string | null
          published_at?: string | null
          published_by?: string | null
          revoked_at?: string | null
          share_token_hash?: string | null
          slide_snapshot: Json
          version_number: number
        }
        Update: {
          deck_id?: string
          id?: string
          pdf_storage_asset_id?: string | null
          pptx_storage_asset_id?: string | null
          published_at?: string | null
          published_by?: string | null
          revoked_at?: string | null
          share_token_hash?: string | null
          slide_snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_deck_versions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "design_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_deck_versions_pdf_storage_asset_id_fkey"
            columns: ["pdf_storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_deck_versions_pptx_storage_asset_id_fkey"
            columns: ["pptx_storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_deck_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_deck_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      design_decks: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          id: string
          root_id: string
          status: Database["public"]["Enums"]["design_deck_status"]
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          root_id: string
          status?: Database["public"]["Enums"]["design_deck_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          root_id?: string
          status?: Database["public"]["Enums"]["design_deck_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_decks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_decks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_decks_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "design_deck_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_decks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_decks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_decks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_proposal_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          current_step: number
          id: string
          manual_stones: Json
          notes: string | null
          requirements: Json
          root_id: string
          selected_inventory_stones: Json
          target_count: number
          task_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          manual_stones?: Json
          notes?: string | null
          requirements?: Json
          root_id: string
          selected_inventory_stones?: Json
          target_count?: number
          task_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          manual_stones?: Json
          notes?: string | null
          requirements?: Json
          root_id?: string
          selected_inventory_stones?: Json
          target_count?: number
          task_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "diamond_proposal_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diamond_proposal_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_proposal_drafts_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_proposal_drafts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_proposal_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diamond_proposal_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_quote_prep: {
        Row: {
          competitor_entries: Json
          created_at: string
          id: string
          line_item_key: string
          line_item_label: string
          line_item_ref_id: string | null
          line_item_snapshot: Json
          line_item_type: string
          notes: string | null
          online_retailer_price: number | null
          prepared_at: string | null
          prepared_by: string | null
          quoted_price: number | null
          raw_median_price: number | null
          root_id: string
          savings: number | null
          scope_fingerprint: string
          updated_at: string
          version: number
        }
        Insert: {
          competitor_entries?: Json
          created_at?: string
          id?: string
          line_item_key: string
          line_item_label: string
          line_item_ref_id?: string | null
          line_item_snapshot?: Json
          line_item_type: string
          notes?: string | null
          online_retailer_price?: number | null
          prepared_at?: string | null
          prepared_by?: string | null
          quoted_price?: number | null
          raw_median_price?: number | null
          root_id: string
          savings?: number | null
          scope_fingerprint: string
          updated_at?: string
          version?: number
        }
        Update: {
          competitor_entries?: Json
          created_at?: string
          id?: string
          line_item_key?: string
          line_item_label?: string
          line_item_ref_id?: string | null
          line_item_snapshot?: Json
          line_item_type?: string
          notes?: string | null
          online_retailer_price?: number | null
          prepared_at?: string | null
          prepared_by?: string | null
          quoted_price?: number | null
          raw_median_price?: number | null
          root_id?: string
          savings?: number | null
          scope_fingerprint?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "diamond_quote_prep_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diamond_quote_prep_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_quote_prep_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_read_model_import_staging: {
        Row: {
          carat: number | null
          carrier: string | null
          clarity: string | null
          client_advisor: string | null
          color: string | null
          company: Database["public"]["Enums"]["brand"]
          customer_appt_at: string | null
          customer_name: string | null
          decision: string | null
          diamond_label: string | null
          import_batch_id: string
          import_cert_no: string
          include_in_active_import: boolean
          invoice_number: string | null
          joc: string | null
          lab: string | null
          loupe360_last_sync_at: string | null
          loupe360_order_number: string | null
          measurements: string | null
          memo_invoice_date: string | null
          order_status: Database["public"]["Enums"]["stone_order_status"] | null
          ordered_by: string | null
          purchased_ordered_date: string | null
          ratio: number | null
          request_date: string | null
          requested_by: string | null
          return_due_date: string | null
          root_appt_id: string
          search_text: string | null
          shape: string | null
          source_cert_no: string | null
          source_row_id: number | null
          source_row_json: Json
          source_row_number: number
          source_sheet: string
          source_spreadsheet_name: string | null
          source_spreadsheet_url: string | null
          source_tab: string | null
          source_workbook: string
          staged_at: string
          stone_status: Database["public"]["Enums"]["stone_status"] | null
          stone_type: string | null
          tracking_eta: string | null
          tracking_notes: string | null
          tracking_number: string | null
          tracking_status: string | null
          tracking_url: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          carat?: number | null
          carrier?: string | null
          clarity?: string | null
          client_advisor?: string | null
          color?: string | null
          company: Database["public"]["Enums"]["brand"]
          customer_appt_at?: string | null
          customer_name?: string | null
          decision?: string | null
          diamond_label?: string | null
          import_batch_id: string
          import_cert_no: string
          include_in_active_import?: boolean
          invoice_number?: string | null
          joc?: string | null
          lab?: string | null
          loupe360_last_sync_at?: string | null
          loupe360_order_number?: string | null
          measurements?: string | null
          memo_invoice_date?: string | null
          order_status?:
            | Database["public"]["Enums"]["stone_order_status"]
            | null
          ordered_by?: string | null
          purchased_ordered_date?: string | null
          ratio?: number | null
          request_date?: string | null
          requested_by?: string | null
          return_due_date?: string | null
          root_appt_id: string
          search_text?: string | null
          shape?: string | null
          source_cert_no?: string | null
          source_row_id?: number | null
          source_row_json?: Json
          source_row_number: number
          source_sheet?: string
          source_spreadsheet_name?: string | null
          source_spreadsheet_url?: string | null
          source_tab?: string | null
          source_workbook: string
          staged_at?: string
          stone_status?: Database["public"]["Enums"]["stone_status"] | null
          stone_type?: string | null
          tracking_eta?: string | null
          tracking_notes?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          carat?: number | null
          carrier?: string | null
          clarity?: string | null
          client_advisor?: string | null
          color?: string | null
          company?: Database["public"]["Enums"]["brand"]
          customer_appt_at?: string | null
          customer_name?: string | null
          decision?: string | null
          diamond_label?: string | null
          import_batch_id?: string
          import_cert_no?: string
          include_in_active_import?: boolean
          invoice_number?: string | null
          joc?: string | null
          lab?: string | null
          loupe360_last_sync_at?: string | null
          loupe360_order_number?: string | null
          measurements?: string | null
          memo_invoice_date?: string | null
          order_status?:
            | Database["public"]["Enums"]["stone_order_status"]
            | null
          ordered_by?: string | null
          purchased_ordered_date?: string | null
          ratio?: number | null
          request_date?: string | null
          requested_by?: string | null
          return_due_date?: string | null
          root_appt_id?: string
          search_text?: string | null
          shape?: string | null
          source_cert_no?: string | null
          source_row_id?: number | null
          source_row_json?: Json
          source_row_number?: number
          source_sheet?: string
          source_spreadsheet_name?: string | null
          source_spreadsheet_url?: string | null
          source_tab?: string | null
          source_workbook?: string
          staged_at?: string
          stone_status?: Database["public"]["Enums"]["stone_status"] | null
          stone_type?: string | null
          tracking_eta?: string | null
          tracking_notes?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      diamond_viewing: {
        Row: {
          budget_note: string | null
          carat_max: number | null
          carat_min: number | null
          clarity_max: string | null
          clarity_min: string | null
          clarity_preferences: string[] | null
          color_max: string | null
          color_min: string | null
          color_preferences: string[] | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          primary_decision_factor: string | null
          ratio_preference: string | null
          root_id: string
          shape: string | null
          stone_type: string | null
          summary: string | null
          updated_at: string
          updated_by: string | null
          variety_focus: string[] | null
          version: number
          workflow_status: string | null
        }
        Insert: {
          budget_note?: string | null
          carat_max?: number | null
          carat_min?: number | null
          clarity_max?: string | null
          clarity_min?: string | null
          clarity_preferences?: string[] | null
          color_max?: string | null
          color_min?: string | null
          color_preferences?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          primary_decision_factor?: string | null
          ratio_preference?: string | null
          root_id: string
          shape?: string | null
          stone_type?: string | null
          summary?: string | null
          updated_at?: string
          updated_by?: string | null
          variety_focus?: string[] | null
          version?: number
          workflow_status?: string | null
        }
        Update: {
          budget_note?: string | null
          carat_max?: number | null
          carat_min?: number | null
          clarity_max?: string | null
          clarity_min?: string | null
          clarity_preferences?: string[] | null
          color_max?: string | null
          color_min?: string | null
          color_preferences?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          primary_decision_factor?: string | null
          ratio_preference?: string | null
          root_id?: string
          shape?: string | null
          stone_type?: string | null
          summary?: string | null
          updated_at?: string
          updated_by?: string | null
          variety_focus?: string[] | null
          version?: number
          workflow_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diamond_viewing_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diamond_viewing_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_viewing_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: true
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_viewing_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diamond_viewing_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_viewing_requirement_events: {
        Row: {
          captured_at: string
          captured_by: string | null
          created_at: string
          id: string
          requirements_snapshot: Json
          root_id: string
          source: string
          task_id: string | null
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          id?: string
          requirements_snapshot?: Json
          root_id: string
          source: string
          task_id?: string | null
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          id?: string
          requirements_snapshot?: Json
          root_id?: string
          source?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diamond_viewing_requirement_events_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diamond_viewing_requirement_events_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_viewing_requirement_events_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_viewing_requirement_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_number_sequences: {
        Row: {
          brand: Database["public"]["Enums"]["brand"]
          doc_family: Database["public"]["Enums"]["doc_family"]
          next_value: number
          updated_at: string
        }
        Insert: {
          brand: Database["public"]["Enums"]["brand"]
          doc_family: Database["public"]["Enums"]["doc_family"]
          next_value?: number
          updated_at?: string
        }
        Update: {
          brand?: Database["public"]["Enums"]["brand"]
          doc_family?: Database["public"]["Enums"]["doc_family"]
          next_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          appt_id: string | null
          brand: Database["public"]["Enums"]["brand"]
          created_at: string
          doc_family: Database["public"]["Enums"]["doc_family"]
          doc_number: string
          document_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by: string
          pdf_storage_asset_id: string | null
          pdf_storage_bucket: string | null
          pdf_storage_path: string | null
          root_id: string
          status: Database["public"]["Enums"]["doc_status"]
          superseded_by: string | null
          supersedes: string | null
          tax_enabled: boolean
          updated_at: string
          version: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          appt_id?: string | null
          brand: Database["public"]["Enums"]["brand"]
          created_at?: string
          doc_family: Database["public"]["Enums"]["doc_family"]
          doc_number: string
          document_id: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by: string
          pdf_storage_asset_id?: string | null
          pdf_storage_bucket?: string | null
          pdf_storage_path?: string | null
          root_id: string
          status?: Database["public"]["Enums"]["doc_status"]
          superseded_by?: string | null
          supersedes?: string | null
          tax_enabled: boolean
          updated_at?: string
          version?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          appt_id?: string | null
          brand?: Database["public"]["Enums"]["brand"]
          created_at?: string
          doc_family?: Database["public"]["Enums"]["doc_family"]
          doc_number?: string
          document_id?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by?: string
          pdf_storage_asset_id?: string | null
          pdf_storage_bucket?: string | null
          pdf_storage_path?: string | null
          root_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          superseded_by?: string | null
          supersedes?: string | null
          tax_enabled?: boolean
          updated_at?: string
          version?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_pdf_storage_asset_fkey"
            columns: ["pdf_storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      human_id_sequences: {
        Row: {
          id_kind: string
          next_value: number
          period: string
          updated_at: string
        }
        Insert: {
          id_kind: string
          next_value?: number
          period: string
          updated_at?: string
        }
        Update: {
          id_kind?: string
          next_value?: number
          period?: string
          updated_at?: string
        }
        Relationships: []
      }
      intake_queue: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          intake_id: string
          payload: Json
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          intake_id: string
          payload: Json
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          intake_id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      meta_ad_accounts: {
        Row: {
          account_status: number | null
          brand_id: string | null
          created_at: string
          currency: string | null
          id: string
          last_synced_at: string | null
          meta_account_id: string
          name: string | null
          raw_json: Json
          timezone_name: string | null
          updated_at: string
        }
        Insert: {
          account_status?: number | null
          brand_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          last_synced_at?: string | null
          meta_account_id: string
          name?: string | null
          raw_json?: Json
          timezone_name?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: number | null
          brand_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          last_synced_at?: string | null
          meta_account_id?: string
          name?: string | null
          raw_json?: Json
          timezone_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_sets: {
        Row: {
          account_id: string | null
          ad_set_id: string
          bid_strategy: string | null
          billing_event: string | null
          brand_id: string | null
          campaign_id: string | null
          campaign_ref_id: string | null
          campaign_umbrella: string | null
          campaign_umbrella_confidence: string | null
          campaign_umbrella_reason: string | null
          campaign_umbrella_source: string | null
          created_at: string
          created_time: string | null
          daily_budget: number | null
          effective_status: string | null
          end_time: string | null
          id: string
          last_synced_at: string | null
          lifetime_budget: number | null
          meta_account_id: string
          name: string | null
          optimization_goal: string | null
          raw_json: Json
          start_time: string | null
          status: string | null
          targeting: Json
          updated_at: string
          updated_time: string | null
        }
        Insert: {
          account_id?: string | null
          ad_set_id: string
          bid_strategy?: string | null
          billing_event?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          campaign_ref_id?: string | null
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          created_at?: string
          created_time?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          end_time?: string | null
          id?: string
          last_synced_at?: string | null
          lifetime_budget?: number | null
          meta_account_id: string
          name?: string | null
          optimization_goal?: string | null
          raw_json?: Json
          start_time?: string | null
          status?: string | null
          targeting?: Json
          updated_at?: string
          updated_time?: string | null
        }
        Update: {
          account_id?: string | null
          ad_set_id?: string
          bid_strategy?: string | null
          billing_event?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          campaign_ref_id?: string | null
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          created_at?: string
          created_time?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          end_time?: string | null
          id?: string
          last_synced_at?: string | null
          lifetime_budget?: number | null
          meta_account_id?: string
          name?: string | null
          optimization_goal?: string | null
          raw_json?: Json
          start_time?: string | null
          status?: string | null
          targeting?: Json
          updated_at?: string
          updated_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_sets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_sets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_sets_campaign_ref_id_fkey"
            columns: ["campaign_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          account_id: string | null
          ad_id: string
          ad_set_id: string | null
          ad_set_ref_id: string | null
          brand_id: string | null
          campaign_id: string | null
          campaign_ref_id: string | null
          campaign_umbrella: string | null
          campaign_umbrella_confidence: string | null
          campaign_umbrella_reason: string | null
          campaign_umbrella_source: string | null
          created_at: string
          created_time: string | null
          creative_id: string | null
          creative_ref_id: string | null
          effective_status: string | null
          id: string
          last_synced_at: string | null
          meta_account_id: string
          name: string | null
          preview_html: string | null
          preview_source: string
          preview_url: string | null
          raw_json: Json
          status: string | null
          updated_at: string
          updated_time: string | null
        }
        Insert: {
          account_id?: string | null
          ad_id: string
          ad_set_id?: string | null
          ad_set_ref_id?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          campaign_ref_id?: string | null
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          created_at?: string
          created_time?: string | null
          creative_id?: string | null
          creative_ref_id?: string | null
          effective_status?: string | null
          id?: string
          last_synced_at?: string | null
          meta_account_id: string
          name?: string | null
          preview_html?: string | null
          preview_source?: string
          preview_url?: string | null
          raw_json?: Json
          status?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Update: {
          account_id?: string | null
          ad_id?: string
          ad_set_id?: string | null
          ad_set_ref_id?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          campaign_ref_id?: string | null
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          created_at?: string
          created_time?: string | null
          creative_id?: string | null
          creative_ref_id?: string | null
          effective_status?: string | null
          id?: string
          last_synced_at?: string | null
          meta_account_id?: string
          name?: string | null
          preview_html?: string | null
          preview_source?: string
          preview_url?: string | null
          raw_json?: Json
          status?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_ad_set_ref_id_fkey"
            columns: ["ad_set_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_campaign_ref_id_fkey"
            columns: ["campaign_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_creative_ref_id_fkey"
            columns: ["creative_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_backfill_chunks: {
        Row: {
          attempts: number
          brand_code: string
          completed_at: string | null
          created_at: string
          end_date: string
          error: string | null
          id: string
          insight_rows: number
          job_id: string
          locked_at: string | null
          meta_account_id: string
          retry_after: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          brand_code: string
          completed_at?: string | null
          created_at?: string
          end_date: string
          error?: string | null
          id?: string
          insight_rows?: number
          job_id: string
          locked_at?: string | null
          meta_account_id: string
          retry_after?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          brand_code?: string
          completed_at?: string | null
          created_at?: string
          end_date?: string
          error?: string | null
          id?: string
          insight_rows?: number
          job_id?: string
          locked_at?: string | null
          meta_account_id?: string
          retry_after?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_backfill_chunks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "meta_ads_backfill_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_backfill_jobs: {
        Row: {
          accounts: Json
          chunk_grain: string
          completed_at: string | null
          completed_chunks: number
          created_at: string
          errors: Json
          failed_chunks: number
          id: string
          metrics: Json
          requested_end: string
          requested_start: string
          running_chunks: number
          started_at: string | null
          status: string
          total_chunks: number
          updated_at: string
        }
        Insert: {
          accounts?: Json
          chunk_grain?: string
          completed_at?: string | null
          completed_chunks?: number
          created_at?: string
          errors?: Json
          failed_chunks?: number
          id?: string
          metrics?: Json
          requested_end: string
          requested_start: string
          running_chunks?: number
          started_at?: string | null
          status?: string
          total_chunks?: number
          updated_at?: string
        }
        Update: {
          accounts?: Json
          chunk_grain?: string
          completed_at?: string | null
          completed_chunks?: number
          created_at?: string
          errors?: Json
          failed_chunks?: number
          id?: string
          metrics?: Json
          requested_end?: string
          requested_start?: string
          running_chunks?: number
          started_at?: string | null
          status?: string
          total_chunks?: number
          updated_at?: string
        }
        Relationships: []
      }
      meta_campaigns: {
        Row: {
          account_id: string | null
          brand_id: string | null
          buying_type: string | null
          campaign_id: string
          campaign_umbrella: string | null
          campaign_umbrella_confidence: string | null
          campaign_umbrella_reason: string | null
          campaign_umbrella_source: string | null
          created_at: string
          created_time: string | null
          effective_status: string | null
          id: string
          last_synced_at: string | null
          meta_account_id: string
          name: string | null
          objective: string | null
          raw_json: Json
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
          updated_time: string | null
        }
        Insert: {
          account_id?: string | null
          brand_id?: string | null
          buying_type?: string | null
          campaign_id: string
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          created_at?: string
          created_time?: string | null
          effective_status?: string | null
          id?: string
          last_synced_at?: string | null
          meta_account_id: string
          name?: string | null
          objective?: string | null
          raw_json?: Json
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Update: {
          account_id?: string | null
          brand_id?: string | null
          buying_type?: string | null
          campaign_id?: string
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          created_at?: string
          created_time?: string | null
          effective_status?: string | null
          id?: string
          last_synced_at?: string | null
          meta_account_id?: string
          name?: string | null
          objective?: string | null
          raw_json?: Json
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
          updated_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_creatives: {
        Row: {
          account_id: string | null
          asset_feed_spec: Json
          asset_metadata: Json
          body: string | null
          brand_id: string | null
          call_to_action_type: string | null
          created_at: string
          creative_id: string
          effective_object_story_id: string | null
          id: string
          image_url: string | null
          last_preview_refresh_at: string | null
          last_synced_at: string | null
          meta_account_id: string
          name: string | null
          object_story_id: string | null
          object_story_spec: Json
          object_type: string | null
          preview_html: string | null
          preview_source: string
          preview_url: string | null
          raw_json: Json
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          video_thumbnail_url: string | null
        }
        Insert: {
          account_id?: string | null
          asset_feed_spec?: Json
          asset_metadata?: Json
          body?: string | null
          brand_id?: string | null
          call_to_action_type?: string | null
          created_at?: string
          creative_id: string
          effective_object_story_id?: string | null
          id?: string
          image_url?: string | null
          last_preview_refresh_at?: string | null
          last_synced_at?: string | null
          meta_account_id: string
          name?: string | null
          object_story_id?: string | null
          object_story_spec?: Json
          object_type?: string | null
          preview_html?: string | null
          preview_source?: string
          preview_url?: string | null
          raw_json?: Json
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_thumbnail_url?: string | null
        }
        Update: {
          account_id?: string | null
          asset_feed_spec?: Json
          asset_metadata?: Json
          body?: string | null
          brand_id?: string | null
          call_to_action_type?: string | null
          created_at?: string
          creative_id?: string
          effective_object_story_id?: string | null
          id?: string
          image_url?: string | null
          last_preview_refresh_at?: string | null
          last_synced_at?: string | null
          meta_account_id?: string
          name?: string | null
          object_story_id?: string | null
          object_story_spec?: Json
          object_type?: string | null
          preview_html?: string | null
          preview_source?: string
          preview_url?: string | null
          raw_json?: Json
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_creatives_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_creatives_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_daily_insights: {
        Row: {
          account_id: string | null
          action_values: Json
          actions: Json
          ad_id: string | null
          ad_name: string | null
          ad_ref_id: string | null
          ad_set_id: string | null
          ad_set_name: string | null
          ad_set_ref_id: string | null
          bookings: number
          brand_id: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_ref_id: string | null
          campaign_umbrella: string | null
          campaign_umbrella_confidence: string | null
          campaign_umbrella_reason: string | null
          campaign_umbrella_source: string | null
          clicks: number
          conversion_rate_ranking: string | null
          conversions: number
          cost_per_action_type: Json
          cost_per_kpi: number | null
          cpc: number
          cpm: number
          created_at: string
          creative_id: string | null
          creative_ref_id: string | null
          ctr: number
          date_start: string
          date_stop: string
          engagement_rate_ranking: string | null
          frequency: number
          id: string
          impressions: number
          inline_link_clicks: number
          kpi_action_type: string | null
          kpi_label: string | null
          kpi_value: number
          leads: number
          meta_account_id: string
          objective: string | null
          optimization_goal: string | null
          quality_ranking: string | null
          raw_json: Json
          reach: number
          spend: number
          unique_clicks: number
          updated_at: string
          video_metrics: Json
        }
        Insert: {
          account_id?: string | null
          action_values?: Json
          actions?: Json
          ad_id?: string | null
          ad_name?: string | null
          ad_ref_id?: string | null
          ad_set_id?: string | null
          ad_set_name?: string | null
          ad_set_ref_id?: string | null
          bookings?: number
          brand_id?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          campaign_ref_id?: string | null
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          clicks?: number
          conversion_rate_ranking?: string | null
          conversions?: number
          cost_per_action_type?: Json
          cost_per_kpi?: number | null
          cpc?: number
          cpm?: number
          created_at?: string
          creative_id?: string | null
          creative_ref_id?: string | null
          ctr?: number
          date_start: string
          date_stop: string
          engagement_rate_ranking?: string | null
          frequency?: number
          id?: string
          impressions?: number
          inline_link_clicks?: number
          kpi_action_type?: string | null
          kpi_label?: string | null
          kpi_value?: number
          leads?: number
          meta_account_id: string
          objective?: string | null
          optimization_goal?: string | null
          quality_ranking?: string | null
          raw_json?: Json
          reach?: number
          spend?: number
          unique_clicks?: number
          updated_at?: string
          video_metrics?: Json
        }
        Update: {
          account_id?: string | null
          action_values?: Json
          actions?: Json
          ad_id?: string | null
          ad_name?: string | null
          ad_ref_id?: string | null
          ad_set_id?: string | null
          ad_set_name?: string | null
          ad_set_ref_id?: string | null
          bookings?: number
          brand_id?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          campaign_ref_id?: string | null
          campaign_umbrella?: string | null
          campaign_umbrella_confidence?: string | null
          campaign_umbrella_reason?: string | null
          campaign_umbrella_source?: string | null
          clicks?: number
          conversion_rate_ranking?: string | null
          conversions?: number
          cost_per_action_type?: Json
          cost_per_kpi?: number | null
          cpc?: number
          cpm?: number
          created_at?: string
          creative_id?: string | null
          creative_ref_id?: string | null
          ctr?: number
          date_start?: string
          date_stop?: string
          engagement_rate_ranking?: string | null
          frequency?: number
          id?: string
          impressions?: number
          inline_link_clicks?: number
          kpi_action_type?: string | null
          kpi_label?: string | null
          kpi_value?: number
          leads?: number
          meta_account_id?: string
          objective?: string | null
          optimization_goal?: string | null
          quality_ranking?: string | null
          raw_json?: Json
          reach?: number
          spend?: number
          unique_clicks?: number
          updated_at?: string
          video_metrics?: Json
        }
        Relationships: [
          {
            foreignKeyName: "meta_daily_insights_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_daily_insights_ad_ref_id_fkey"
            columns: ["ad_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_daily_insights_ad_set_ref_id_fkey"
            columns: ["ad_set_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_daily_insights_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_daily_insights_campaign_ref_id_fkey"
            columns: ["campaign_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_daily_insights_creative_ref_id_fkey"
            columns: ["creative_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_social_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string | null
          comment_id: string
          content_id: string | null
          content_permalink: string | null
          created_at: string
          created_time: string | null
          hidden: boolean | null
          id: string
          ig_user_id: string | null
          last_synced_at: string | null
          like_count: number
          page_id: string | null
          parent_comment_id: string | null
          platform: string
          raw_json: Json
          reply_count: number
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body?: string | null
          comment_id: string
          content_id?: string | null
          content_permalink?: string | null
          created_at?: string
          created_time?: string | null
          hidden?: boolean | null
          id?: string
          ig_user_id?: string | null
          last_synced_at?: string | null
          like_count?: number
          page_id?: string | null
          parent_comment_id?: string | null
          platform: string
          raw_json?: Json
          reply_count?: number
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string | null
          comment_id?: string
          content_id?: string | null
          content_permalink?: string | null
          created_at?: string
          created_time?: string | null
          hidden?: boolean | null
          id?: string
          ig_user_id?: string | null
          last_synced_at?: string | null
          like_count?: number
          page_id?: string | null
          parent_comment_id?: string | null
          platform?: string
          raw_json?: Json
          reply_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      meta_social_messages: {
        Row: {
          attachments: Json
          body: string | null
          created_at: string
          direction: string
          id: string
          message_id: string
          platform: string
          raw_json: Json
          recipient_id: string | null
          recipient_name: string | null
          sender_id: string | null
          sender_name: string | null
          sent_at: string | null
          thread_id: string
          thread_ref_id: string | null
        }
        Insert: {
          attachments?: Json
          body?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_id: string
          platform: string
          raw_json?: Json
          recipient_id?: string | null
          recipient_name?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sent_at?: string | null
          thread_id: string
          thread_ref_id?: string | null
        }
        Update: {
          attachments?: Json
          body?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_id?: string
          platform?: string
          raw_json?: Json
          recipient_id?: string | null
          recipient_name?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sent_at?: string | null
          thread_id?: string
          thread_ref_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_social_messages_thread_ref_id_fkey"
            columns: ["thread_ref_id"]
            isOneToOne: false
            referencedRelation: "meta_social_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_social_pages: {
        Row: {
          created_at: string
          id: string
          ig_user_id: string | null
          ig_username: string | null
          last_synced_at: string | null
          name: string | null
          page_id: string
          raw_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          last_synced_at?: string | null
          name?: string | null
          page_id: string
          raw_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          last_synced_at?: string | null
          name?: string | null
          page_id?: string
          raw_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      meta_social_sync_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          errors: Json
          id: string
          metrics: Json
          page_ids: Json
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          errors?: Json
          id?: string
          metrics?: Json
          page_ids?: Json
          started_at?: string
          status?: string
          trigger: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          errors?: Json
          id?: string
          metrics?: Json
          page_ids?: Json
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      meta_social_threads: {
        Row: {
          created_at: string
          id: string
          ig_user_id: string | null
          last_message_at: string | null
          last_synced_at: string | null
          message_count: number
          page_id: string | null
          participant_id: string | null
          participant_name: string | null
          platform: string
          raw_json: Json
          snippet: string | null
          thread_id: string
          thread_type: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ig_user_id?: string | null
          last_message_at?: string | null
          last_synced_at?: string | null
          message_count?: number
          page_id?: string | null
          participant_id?: string | null
          participant_name?: string | null
          platform: string
          raw_json?: Json
          snippet?: string | null
          thread_id: string
          thread_type?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ig_user_id?: string | null
          last_message_at?: string | null
          last_synced_at?: string | null
          message_count?: number
          page_id?: string | null
          participant_id?: string | null
          participant_name?: string | null
          platform?: string
          raw_json?: Json
          snippet?: string | null
          thread_id?: string
          thread_type?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ops_log: {
        Row: {
          action: string
          category: string
          duration_ms: number | null
          error: string | null
          id: string
          occurred_at: string
          payload: Json | null
          result: string
          target_document_id: string | null
          target_root_id: string | null
          target_task_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          category: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          result: string
          target_document_id?: string | null
          target_root_id?: string | null
          target_task_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          category?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          result?: string
          target_document_id?: string | null
          target_root_id?: string | null
          target_task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_log_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_log_target_root_id_fkey"
            columns: ["target_root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_log_target_task_id_fkey"
            columns: ["target_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ops_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_3d: {
        Row: {
          brand: Database["public"]["Enums"]["brand"]
          created_at: string
          created_by: string | null
          design_request: string | null
          id: string
          no_3d_reason: string | null
          odoo_url: string | null
          root_id: string
          short_tag: string | null
          so_linked_at: string | null
          so_linked_by: string | null
          so_number: string | null
          updated_at: string
          updated_by: string | null
          version: number
          wax_needed: string | null
        }
        Insert: {
          brand: Database["public"]["Enums"]["brand"]
          created_at?: string
          created_by?: string | null
          design_request?: string | null
          id?: string
          no_3d_reason?: string | null
          odoo_url?: string | null
          root_id: string
          short_tag?: string | null
          so_linked_at?: string | null
          so_linked_by?: string | null
          so_number?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          wax_needed?: string | null
        }
        Update: {
          brand?: Database["public"]["Enums"]["brand"]
          created_at?: string
          created_by?: string | null
          design_request?: string | null
          id?: string
          no_3d_reason?: string | null
          odoo_url?: string | null
          root_id?: string
          short_tag?: string | null
          so_linked_at?: string | null
          so_linked_by?: string | null
          so_number?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          wax_needed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_3d_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_3d_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_3d_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: true
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_3d_so_linked_by_fkey"
            columns: ["so_linked_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_3d_so_linked_by_fkey"
            columns: ["so_linked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_3d_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_3d_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_3d_revisions: {
        Row: {
          accent_type: string | null
          action: string
          band_width_mm: number | null
          center_type: string | null
          created_at: string
          created_by: string
          design_notes: string | null
          diamond_dimension: string | null
          id: string
          metal: string | null
          mode: string | null
          order_3d_id: string
          revision_id: string
          revision_number: number
          ring_style: string | null
          root_id: string
          shape: string | null
          us_size: number | null
        }
        Insert: {
          accent_type?: string | null
          action: string
          band_width_mm?: number | null
          center_type?: string | null
          created_at?: string
          created_by: string
          design_notes?: string | null
          diamond_dimension?: string | null
          id?: string
          metal?: string | null
          mode?: string | null
          order_3d_id: string
          revision_id: string
          revision_number: number
          ring_style?: string | null
          root_id: string
          shape?: string | null
          us_size?: number | null
        }
        Update: {
          accent_type?: string | null
          action?: string
          band_width_mm?: number | null
          center_type?: string | null
          created_at?: string
          created_by?: string
          design_notes?: string | null
          diamond_dimension?: string | null
          id?: string
          metal?: string | null
          mode?: string | null
          order_3d_id?: string
          revision_id?: string
          revision_number?: number
          ring_style?: string | null
          root_id?: string
          shape?: string | null
          us_size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_3d_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_3d_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_3d_revisions_order_3d_id_fkey"
            columns: ["order_3d_id"]
            isOneToOne: false
            referencedRelation: "order_3d"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_3d_revisions_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_ledger: {
        Row: {
          amount_received: number | null
          balance_due: number | null
          created_at: string
          document_id: string
          fees: number
          id: string
          invoice_total: number
          line_items: Json
          method: string | null
          net_amount: number | null
          reference: string | null
          referral_discount: number
          so: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          updated_at: string
          version: number
        }
        Insert: {
          amount_received?: number | null
          balance_due?: number | null
          created_at?: string
          document_id: string
          fees?: number
          id?: string
          invoice_total: number
          line_items: Json
          method?: string | null
          net_amount?: number | null
          reference?: string | null
          referral_discount?: number
          so?: string | null
          subtotal: number
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
          version?: number
        }
        Update: {
          amount_received?: number | null
          balance_due?: number | null
          created_at?: string
          document_id?: string
          fees?: number
          id?: string
          invoice_total?: number
          line_items?: Json
          method?: string | null
          net_amount?: number | null
          reference?: string | null
          referral_discount?: number
          so?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_ledger_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_read_model_import_staging: {
        Row: {
          amount_gross: number | null
          amount_net: number | null
          balance_due: number | null
          brand: Database["public"]["Enums"]["brand"]
          doc_family: Database["public"]["Enums"]["doc_family"]
          doc_status: Database["public"]["Enums"]["doc_status"]
          import_batch_id: string
          import_doc_number: string
          include_in_active_import: boolean
          method: string | null
          order_total: number | null
          payment_at: string | null
          payment_at_ms: number | null
          payment_id: string
          root_appt_id: string
          search_text: string | null
          so_number: string | null
          source_doc_number: string | null
          source_doc_type: string | null
          source_key: string | null
          source_row_id: number | null
          source_row_json: Json
          source_row_number: number
          source_sheet: string
          source_workbook: string
          staged_at: string
          updated_at: string
        }
        Insert: {
          amount_gross?: number | null
          amount_net?: number | null
          balance_due?: number | null
          brand: Database["public"]["Enums"]["brand"]
          doc_family: Database["public"]["Enums"]["doc_family"]
          doc_status?: Database["public"]["Enums"]["doc_status"]
          import_batch_id: string
          import_doc_number: string
          include_in_active_import?: boolean
          method?: string | null
          order_total?: number | null
          payment_at?: string | null
          payment_at_ms?: number | null
          payment_id: string
          root_appt_id: string
          search_text?: string | null
          so_number?: string | null
          source_doc_number?: string | null
          source_doc_type?: string | null
          source_key?: string | null
          source_row_id?: number | null
          source_row_json?: Json
          source_row_number: number
          source_sheet?: string
          source_workbook: string
          staged_at?: string
          updated_at?: string
        }
        Update: {
          amount_gross?: number | null
          amount_net?: number | null
          balance_due?: number | null
          brand?: Database["public"]["Enums"]["brand"]
          doc_family?: Database["public"]["Enums"]["doc_family"]
          doc_status?: Database["public"]["Enums"]["doc_status"]
          import_batch_id?: string
          import_doc_number?: string
          include_in_active_import?: boolean
          method?: string | null
          order_total?: number | null
          payment_at?: string | null
          payment_at_ms?: number | null
          payment_id?: string
          root_appt_id?: string
          search_text?: string | null
          so_number?: string | null
          source_doc_number?: string | null
          source_doc_type?: string | null
          source_key?: string | null
          source_row_id?: number | null
          source_row_json?: Json
          source_row_number?: number
          source_sheet?: string
          source_workbook?: string
          staged_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_consult_task_drafts: {
        Row: {
          appt_id: string | null
          center_stone_status: string | null
          created_at: string
          design_status: string | null
          id: string
          internal_notes: string | null
          logistics_status: string | null
          lost_lead_notes: string | null
          lost_lead_reason: string | null
          next_steps: string | null
          production_status: string | null
          root_id: string
          sales_stage: string | null
          task_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          appt_id?: string | null
          center_stone_status?: string | null
          created_at?: string
          design_status?: string | null
          id?: string
          internal_notes?: string | null
          logistics_status?: string | null
          lost_lead_notes?: string | null
          lost_lead_reason?: string | null
          next_steps?: string | null
          production_status?: string | null
          root_id: string
          sales_stage?: string | null
          task_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          appt_id?: string | null
          center_stone_status?: string | null
          created_at?: string
          design_status?: string | null
          id?: string
          internal_notes?: string | null
          logistics_status?: string | null
          lost_lead_notes?: string | null
          lost_lead_reason?: string | null
          next_steps?: string | null
          production_status?: string | null
          root_id?: string
          sales_stage?: string | null
          task_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_consult_task_drafts_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_consult_task_drafts_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_consult_task_drafts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_consult_task_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_consult_task_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_consult_task_files: {
        Row: {
          appt_id: string | null
          created_at: string
          created_by: string | null
          file_kind: string
          id: string
          root_id: string
          storage_asset_id: string
          task_id: string
        }
        Insert: {
          appt_id?: string | null
          created_at?: string
          created_by?: string | null
          file_kind: string
          id?: string
          root_id: string
          storage_asset_id: string
          task_id: string
        }
        Update: {
          appt_id?: string | null
          created_at?: string
          created_by?: string | null
          file_kind?: string
          id?: string
          root_id?: string
          storage_asset_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_consult_task_files_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_consult_task_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_consult_task_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_consult_task_files_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_consult_task_files_storage_asset_id_fkey"
            columns: ["storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_consult_task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          document_id: string
          id: string
          notes: string | null
          settings_snapshot: Json
          so: string | null
          stones_snapshot: Json
          subtotal_diamonds: number | null
          subtotal_settings: number | null
          total: number | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          notes?: string | null
          settings_snapshot: Json
          so?: string | null
          stones_snapshot: Json
          subtotal_diamonds?: number | null
          subtotal_settings?: number | null
          total?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          notes?: string | null
          settings_snapshot?: Json
          so?: string | null
          stones_snapshot?: Json
          subtotal_diamonds?: number | null
          subtotal_settings?: number | null
          total?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_analysis_groups: {
        Row: {
          appt_id: string
          created_at: string
          group_type: string
          id: string
          root_id: string
          status: string
          task_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          appt_id: string
          created_at?: string
          group_type: string
          id?: string
          root_id: string
          status?: string
          task_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          appt_id?: string
          created_at?: string
          group_type?: string
          id?: string
          root_id?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recording_analysis_groups_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_analysis_groups_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_analysis_groups_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_sessions: {
        Row: {
          analysis_group_id: string | null
          appointment_artifact_id: string | null
          appt_id: string
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          consent_confirmed_at: string | null
          consent_confirmed_by: string | null
          created_at: string
          device_info: Json | null
          duration_seconds: number | null
          id: string
          last_error: string | null
          last_error_at: string | null
          launch_token_expires_at: string
          launch_token_hash: string
          launch_token_used_at: string | null
          native_started_at: string | null
          native_stopped_at: string | null
          recording_type: Database["public"]["Enums"]["recording_type"]
          requested_by: string | null
          root_id: string
          source_context: Json
          status: Database["public"]["Enums"]["recording_session_status"]
          storage_asset_id: string | null
          updated_at: string
          upload_bucket: string | null
          upload_mime_type: string | null
          upload_path: string | null
          upload_size_bytes: number | null
          version: number
        }
        Insert: {
          analysis_group_id?: string | null
          appointment_artifact_id?: string | null
          appt_id: string
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          consent_confirmed_at?: string | null
          consent_confirmed_by?: string | null
          created_at?: string
          device_info?: Json | null
          duration_seconds?: number | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          launch_token_expires_at: string
          launch_token_hash: string
          launch_token_used_at?: string | null
          native_started_at?: string | null
          native_stopped_at?: string | null
          recording_type: Database["public"]["Enums"]["recording_type"]
          requested_by?: string | null
          root_id: string
          source_context?: Json
          status?: Database["public"]["Enums"]["recording_session_status"]
          storage_asset_id?: string | null
          updated_at?: string
          upload_bucket?: string | null
          upload_mime_type?: string | null
          upload_path?: string | null
          upload_size_bytes?: number | null
          version?: number
        }
        Update: {
          analysis_group_id?: string | null
          appointment_artifact_id?: string | null
          appt_id?: string
          artifact_type?: Database["public"]["Enums"]["artifact_type"]
          consent_confirmed_at?: string | null
          consent_confirmed_by?: string | null
          created_at?: string
          device_info?: Json | null
          duration_seconds?: number | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          launch_token_expires_at?: string
          launch_token_hash?: string
          launch_token_used_at?: string | null
          native_started_at?: string | null
          native_stopped_at?: string | null
          recording_type?: Database["public"]["Enums"]["recording_type"]
          requested_by?: string | null
          root_id?: string
          source_context?: Json
          status?: Database["public"]["Enums"]["recording_session_status"]
          storage_asset_id?: string | null
          updated_at?: string
          upload_bucket?: string | null
          upload_mime_type?: string | null
          upload_path?: string | null
          upload_size_bytes?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recording_sessions_analysis_group_id_fkey"
            columns: ["analysis_group_id"]
            isOneToOne: false
            referencedRelation: "recording_analysis_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_appointment_artifact_id_fkey"
            columns: ["appointment_artifact_id"]
            isOneToOne: false
            referencedRelation: "appointment_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_consent_confirmed_by_fkey"
            columns: ["consent_confirmed_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "recording_sessions_consent_confirmed_by_fkey"
            columns: ["consent_confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "recording_sessions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_sessions_storage_asset_id_fkey"
            columns: ["storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_playbook_entries: {
        Row: {
          active: boolean
          answer_guidance: string
          brand: string
          category: string
          created_at: string
          id: string
          language: string
          source: string | null
          trigger_keywords: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          answer_guidance: string
          brand: string
          category: string
          created_at?: string
          id?: string
          language: string
          source?: string | null
          trigger_keywords?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          answer_guidance?: string
          brand?: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          source?: string | null
          trigger_keywords?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      root_appointments: {
        Row: {
          brand: Database["public"]["Enums"]["brand"]
          created_at: string
          current_appt_id: string | null
          customer_id: string
          id: string
          root_appt_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          brand: Database["public"]["Enums"]["brand"]
          created_at?: string
          current_appt_id?: string | null
          customer_id: string
          id?: string
          root_appt_id: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          brand?: Database["public"]["Enums"]["brand"]
          created_at?: string
          current_appt_id?: string | null
          customer_id?: string
          id?: string
          root_appt_id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "root_appointments_current_appt_id_fkey"
            columns: ["current_appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "root_appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_schedule: {
        Row: {
          coverage_enabled: boolean
          coverage_partner_user_id: string | null
          created_at: string
          default_joc_user_id: string | null
          id: string
          skill_general_appointment: Database["public"]["Enums"]["qualification_tier"]
          skill_lab_diamond: Database["public"]["Enums"]["qualification_tier"]
          skill_natural_diamond: Database["public"]["Enums"]["qualification_tier"]
          updated_at: string
          user_id: string
          version: number
          working_days: string[]
        }
        Insert: {
          coverage_enabled?: boolean
          coverage_partner_user_id?: string | null
          created_at?: string
          default_joc_user_id?: string | null
          id?: string
          skill_general_appointment?: Database["public"]["Enums"]["qualification_tier"]
          skill_lab_diamond?: Database["public"]["Enums"]["qualification_tier"]
          skill_natural_diamond?: Database["public"]["Enums"]["qualification_tier"]
          updated_at?: string
          user_id: string
          version?: number
          working_days?: string[]
        }
        Update: {
          coverage_enabled?: boolean
          coverage_partner_user_id?: string | null
          created_at?: string
          default_joc_user_id?: string | null
          id?: string
          skill_general_appointment?: Database["public"]["Enums"]["qualification_tier"]
          skill_lab_diamond?: Database["public"]["Enums"]["qualification_tier"]
          skill_natural_diamond?: Database["public"]["Enums"]["qualification_tier"]
          updated_at?: string
          user_id?: string
          version?: number
          working_days?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "roster_schedule_coverage_partner_user_id_fkey"
            columns: ["coverage_partner_user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "roster_schedule_coverage_partner_user_id_fkey"
            columns: ["coverage_partner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_schedule_default_joc_user_id_fkey"
            columns: ["default_joc_user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "roster_schedule_default_joc_user_id_fkey"
            columns: ["default_joc_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_schedule_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "roster_schedule_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_changes: {
        Row: {
          available_from: string | null
          available_until: string | null
          change_date: string
          change_type: Database["public"]["Enums"]["schedule_change_type"]
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          change_date: string
          change_type: Database["public"]["Enums"]["schedule_change_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          change_date?: string
          change_type?: Database["public"]["Enums"]["schedule_change_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_changes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "schedule_changes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "schedule_changes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_thread_summaries: {
        Row: {
          created_at: string
          id: string
          language: string
          last_message_at: string | null
          message_count: number
          model: string | null
          platform: string
          source_message_ids: Json
          summary: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string | null
          message_count?: number
          model?: string | null
          platform: string
          source_message_ids?: Json
          summary: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string | null
          message_count?: number
          model?: string | null
          platform?: string
          source_message_ids?: Json
          summary?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stones: {
        Row: {
          assigned_advisor_id: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_customer_name: string | null
          assigned_joc_id: string | null
          assigned_root_id: string | null
          carat: number | null
          carrier: string | null
          cert_no: string
          clarity: string | null
          color: string | null
          cost_per_carat: number | null
          created_at: string
          created_by: string | null
          customer_price_per_carat: number | null
          customer_total_price: number | null
          cut: string | null
          decision: string | null
          fluor_color: string | null
          fluor_intensity: string | null
          hold: boolean
          id: string
          joc_handoff_at: string | null
          lab: string | null
          last_tracking_check_at: string | null
          measurements: string | null
          memo_invoice_date: string | null
          order_status: Database["public"]["Enums"]["stone_order_status"] | null
          ordered_by: string | null
          polish: string | null
          purchased_ordered_date: string | null
          ratio: number | null
          return_due_date: string | null
          return_notes: string | null
          shape: string | null
          stone_status: Database["public"]["Enums"]["stone_status"] | null
          stone_type: string | null
          symmetry: string | null
          total_cost: number | null
          tracking_eta: string | null
          tracking_notes: string | null
          tracking_number: string | null
          tracking_status: string | null
          tracking_url: string | null
          updated_at: string
          updated_by: string | null
          vendor: string | null
          version: number
        }
        Insert: {
          assigned_advisor_id?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_customer_name?: string | null
          assigned_joc_id?: string | null
          assigned_root_id?: string | null
          carat?: number | null
          carrier?: string | null
          cert_no: string
          clarity?: string | null
          color?: string | null
          cost_per_carat?: number | null
          created_at?: string
          created_by?: string | null
          customer_price_per_carat?: number | null
          customer_total_price?: number | null
          cut?: string | null
          decision?: string | null
          fluor_color?: string | null
          fluor_intensity?: string | null
          hold?: boolean
          id?: string
          joc_handoff_at?: string | null
          lab?: string | null
          last_tracking_check_at?: string | null
          measurements?: string | null
          memo_invoice_date?: string | null
          order_status?:
            | Database["public"]["Enums"]["stone_order_status"]
            | null
          ordered_by?: string | null
          polish?: string | null
          purchased_ordered_date?: string | null
          ratio?: number | null
          return_due_date?: string | null
          return_notes?: string | null
          shape?: string | null
          stone_status?: Database["public"]["Enums"]["stone_status"] | null
          stone_type?: string | null
          symmetry?: string | null
          total_cost?: number | null
          tracking_eta?: string | null
          tracking_notes?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor?: string | null
          version?: number
        }
        Update: {
          assigned_advisor_id?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_customer_name?: string | null
          assigned_joc_id?: string | null
          assigned_root_id?: string | null
          carat?: number | null
          carrier?: string | null
          cert_no?: string
          clarity?: string | null
          color?: string | null
          cost_per_carat?: number | null
          created_at?: string
          created_by?: string | null
          customer_price_per_carat?: number | null
          customer_total_price?: number | null
          cut?: string | null
          decision?: string | null
          fluor_color?: string | null
          fluor_intensity?: string | null
          hold?: boolean
          id?: string
          joc_handoff_at?: string | null
          lab?: string | null
          last_tracking_check_at?: string | null
          measurements?: string | null
          memo_invoice_date?: string | null
          order_status?:
            | Database["public"]["Enums"]["stone_order_status"]
            | null
          ordered_by?: string | null
          polish?: string | null
          purchased_ordered_date?: string | null
          ratio?: number | null
          return_due_date?: string | null
          return_notes?: string | null
          shape?: string | null
          stone_status?: Database["public"]["Enums"]["stone_status"] | null
          stone_type?: string | null
          symmetry?: string | null
          total_cost?: number | null
          tracking_eta?: string | null
          tracking_notes?: string | null
          tracking_number?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "stones_assigned_advisor_id_fkey"
            columns: ["assigned_advisor_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stones_assigned_advisor_id_fkey"
            columns: ["assigned_advisor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stones_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stones_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stones_assigned_joc_id_fkey"
            columns: ["assigned_joc_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stones_assigned_joc_id_fkey"
            columns: ["assigned_joc_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stones_assigned_root_id_fkey"
            columns: ["assigned_root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stones_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stones_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stones_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stones_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stones_sync: {
        Row: {
          appended: number
          applied_at: string
          applied_by: string
          conflicts: number
          detail: Json | null
          id: string
          matched: number
          notes: string | null
          skipped: number
          source_filename: string | null
          source_rows: number
          source_storage_asset_id: string | null
          sync_id: string
          updated: number
        }
        Insert: {
          appended: number
          applied_at?: string
          applied_by: string
          conflicts: number
          detail?: Json | null
          id?: string
          matched: number
          notes?: string | null
          skipped: number
          source_filename?: string | null
          source_rows: number
          source_storage_asset_id?: string | null
          sync_id: string
          updated: number
        }
        Update: {
          appended?: number
          applied_at?: string
          applied_by?: string
          conflicts?: number
          detail?: Json | null
          id?: string
          matched?: number
          notes?: string | null
          skipped?: number
          source_filename?: string | null
          source_rows?: number
          source_storage_asset_id?: string | null
          sync_id?: string
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "stones_sync_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stones_sync_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stones_sync_source_storage_asset_fkey"
            columns: ["source_storage_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_assets: {
        Row: {
          appt_id: string | null
          artifact_id: string | null
          bucket: string
          canonical_filename: string | null
          checksum_sha256: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          mime_type: string | null
          original_filename: string | null
          path: string
          purpose: Database["public"]["Enums"]["storage_asset_purpose"]
          root_id: string | null
          size_bytes: number | null
        }
        Insert: {
          appt_id?: string | null
          artifact_id?: string | null
          bucket: string
          canonical_filename?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          path: string
          purpose: Database["public"]["Enums"]["storage_asset_purpose"]
          root_id?: string | null
          size_bytes?: number | null
        }
        Update: {
          appt_id?: string | null
          artifact_id?: string | null
          bucket?: string
          canonical_filename?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          path?: string
          purpose?: Database["public"]["Enums"]["storage_asset_purpose"]
          root_id?: string | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_assets_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_assets_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "appointment_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "storage_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_assets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_assets_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          ad_account_ids: Json
          completed_at: string | null
          created_at: string
          errors: Json
          id: string
          metrics: Json
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          ad_account_ids?: Json
          completed_at?: string | null
          created_at?: string
          errors?: Json
          id?: string
          metrics?: Json
          started_at?: string
          status?: string
          trigger: string
        }
        Update: {
          ad_account_ids?: Json
          completed_at?: string | null
          created_at?: string
          errors?: Json
          id?: string
          metrics?: Json
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      task_collaborators: {
        Row: {
          collaborator_role: Database["public"]["Enums"]["user_role"] | null
          collaborator_user_id: string | null
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          collaborator_role?: Database["public"]["Enums"]["user_role"] | null
          collaborator_user_id?: string | null
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          collaborator_role?: Database["public"]["Enums"]["user_role"] | null
          collaborator_user_id?: string | null
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_collaborators_collaborator_user_id_fkey"
            columns: ["collaborator_user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "task_collaborators_collaborator_user_id_fkey"
            columns: ["collaborator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_gen_queue: {
        Row: {
          enqueued_at: string
          root_id: string
        }
        Insert: {
          enqueued_at?: string
          root_id: string
        }
        Update: {
          enqueued_at?: string
          root_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_gen_queue_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: true
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      task_log: {
        Row: {
          actor_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json | null
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          task_id: string
        }
        Update: {
          actor_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "task_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          appt_id: string | null
          blocked_reason: string | null
          completed_at: string | null
          completed_by: string | null
          completion_payload: Json | null
          coverage_reason: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          instructions: string | null
          intended_owner_id: string | null
          lifecycle_stage: string | null
          owner_kind: Database["public"]["Enums"]["task_owner_kind"]
          owner_role: Database["public"]["Enums"]["user_role"] | null
          owner_user_id: string | null
          payload: Json | null
          primary_action: string | null
          root_id: string | null
          snooze_reason: string | null
          snooze_until: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_id: string
          task_title: string | null
          task_type: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          appt_id?: string | null
          blocked_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_payload?: Json | null
          coverage_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          instructions?: string | null
          intended_owner_id?: string | null
          lifecycle_stage?: string | null
          owner_kind: Database["public"]["Enums"]["task_owner_kind"]
          owner_role?: Database["public"]["Enums"]["user_role"] | null
          owner_user_id?: string | null
          payload?: Json | null
          primary_action?: string | null
          root_id?: string | null
          snooze_reason?: string | null
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_id: string
          task_title?: string | null
          task_type: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          appt_id?: string | null
          blocked_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_payload?: Json | null
          coverage_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          instructions?: string | null
          intended_owner_id?: string | null
          lifecycle_stage?: string | null
          owner_kind?: Database["public"]["Enums"]["task_owner_kind"]
          owner_role?: Database["public"]["Enums"]["user_role"] | null
          owner_user_id?: string | null
          payload?: Json | null
          primary_action?: string | null
          root_id?: string | null
          snooze_reason?: string | null
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_id?: string
          task_title?: string | null
          task_type?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_appt_id_fkey"
            columns: ["appt_id"]
            isOneToOne: false
            referencedRelation: "appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_intended_owner_id_fkey"
            columns: ["intended_owner_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_intended_owner_id_fkey"
            columns: ["intended_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body: string
          description: string | null
          id: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          description?: string | null
          id?: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          description?: string | null
          id?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean
          auth_user_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          initials: string | null
          notes: string | null
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          auth_user_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          initials?: string | null
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          auth_user_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          initials?: string | null
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      wax_requests: {
        Row: {
          admin_deadline: string | null
          completed_date: string | null
          created_at: string
          created_by: string | null
          est_print_date: string | null
          id: string
          needed_by_rep: string | null
          notes: string | null
          priority: string
          request_id: string
          request_url: string | null
          root_id: string
          so_mo: string | null
          status: string
          status_notes: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          admin_deadline?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          est_print_date?: string | null
          id?: string
          needed_by_rep?: string | null
          notes?: string | null
          priority: string
          request_id: string
          request_url?: string | null
          root_id: string
          so_mo?: string | null
          status: string
          status_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          admin_deadline?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          est_print_date?: string | null
          id?: string
          needed_by_rep?: string | null
          notes?: string | null
          priority?: string
          request_id?: string
          request_url?: string | null
          root_id?: string
          so_mo?: string | null
          status?: string
          status_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wax_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wax_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wax_requests_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "root_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wax_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wax_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_inbox_unread_count: {
        Row: {
          unread_count: number | null
          user_id: string | null
        }
        Insert: {
          unread_count?: never
          user_id?: string | null
        }
        Update: {
          unread_count?: never
          user_id?: string | null
        }
        Relationships: []
      }
      user_visible_broadcasts: {
        Row: {
          body: string | null
          broadcast_id: string | null
          expires_at: string | null
          id: string | null
          priority: Database["public"]["Enums"]["broadcast_priority"] | null
          sent_at: string | null
          sent_by: string | null
          subject: string | null
          viewer_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "user_inbox_unread_count"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aggregate_meta_daily_insights: {
        Args: {
          p_dimensions?: string[]
          p_end: string
          p_filters?: Json
          p_limit?: number
          p_sort_direction?: string
          p_sort_field?: string
          p_start: string
        }
        Returns: {
          ad: string
          ad_id: string
          ad_set: string
          ad_set_id: string
          bookings: number
          brand: string
          campaign: string
          campaign_id: string
          campaign_umbrella: string
          clicks: number
          conversions: number
          cpc: number
          cpl: number
          cpm: number
          creative: string
          creative_id: string
          ctr: number
          date: string
          frequency: number
          impressions: number
          leads: number
          messaging_contacts: number
          month: string
          monthly_budget: number
          new_messaging_contacts: number
          primary_results: number
          reach: number
          secondary_results: number
          source_rows: number
          spend: number
          website_bookings: number
          week: string
        }[]
      }
      apply_appointment_read_model_import: {
        Args: { p_import_batch_id?: string }
        Returns: {
          rows_affected: number
          target_table: string
        }[]
      }
      apply_customer_read_model_import: {
        Args: { p_import_batch_id?: string; p_imported_by?: string }
        Returns: {
          rows_affected: number
          target_table: string
        }[]
      }
      apply_diamond_read_model_import: {
        Args: { p_import_batch_id?: string }
        Returns: {
          rows_affected: number
          target_table: string
        }[]
      }
      apply_payment_read_model_import: {
        Args: { p_import_batch_id?: string; p_imported_by?: string }
        Returns: {
          rows_affected: number
          target_table: string
        }[]
      }
      blocked_vendor_term: { Args: never; Returns: string }
      can_operate_task: { Args: { p_task_id: string }; Returns: boolean }
      can_read_broadcast: { Args: { p_broadcast_id: string }; Returns: boolean }
      can_read_root: { Args: { p_root_id: string }; Returns: boolean }
      can_write_root: { Args: { p_root_id: string }; Returns: boolean }
      claim_meta_ads_backfill_chunks: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          brand_code: string
          completed_at: string | null
          created_at: string
          end_date: string
          error: string | null
          id: string
          insight_rows: number
          job_id: string
          locked_at: string | null
          meta_account_id: string
          retry_after: string | null
          start_date: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "meta_ads_backfill_chunks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_payment_document_with_ledger: {
        Args: {
          p_amount_received: number
          p_balance_due: number
          p_brand: Database["public"]["Enums"]["brand"]
          p_doc_family: Database["public"]["Enums"]["doc_family"]
          p_fees: number
          p_idempotency_key: string
          p_invoice_total: number
          p_issued_by: string
          p_line_items: Json
          p_method: string
          p_net_amount: number
          p_reference: string
          p_referral_discount: number
          p_root_id: string
          p_so: string
          p_subtotal: number
          p_tax_amount: number
          p_tax_enabled: boolean
          p_tax_rate: number
        }
        Returns: Json
      }
      current_app_user_id: { Args: never; Returns: string }
      current_user_has_any_role: {
        Args: { p_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      current_user_has_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      customer_purge_actor_is_admin: {
        Args: { p_actor_user_id?: string }
        Returns: boolean
      }
      execute_test_customer_purge: {
        Args: {
          p_actor_user_id: string
          p_confirmation?: string
          p_customer_id: string
          p_delete_storage_objects?: boolean
          p_reason: string
        }
        Returns: Json
      }
      meta_ads_history_coverage: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          account_name: string
          first_date: string
          insight_rows: number
          last_date: string
          meta_account_id: string
          month: string
        }[]
      }
      next_customer_code: { Args: { p_at?: string }; Returns: string }
      next_doc_number: {
        Args: {
          p_brand: Database["public"]["Enums"]["brand"]
          p_doc_family: Database["public"]["Enums"]["doc_family"]
        }
        Returns: string
      }
      next_root_appt_id: { Args: { p_visit_at?: string }; Returns: string }
      preview_appointment_read_model_import: {
        Args: { p_import_batch_id?: string }
        Returns: {
          check_name: string
          issue_count: number
        }[]
      }
      preview_customer_read_model_import: {
        Args: { p_import_batch_id?: string }
        Returns: {
          check_name: string
          issue_count: number
        }[]
      }
      preview_customer_read_model_owner_mapping: {
        Args: { p_import_batch_id?: string }
        Returns: {
          check_name: string
          issue_count: number
        }[]
      }
      preview_diamond_read_model_import: {
        Args: { p_import_batch_id?: string }
        Returns: {
          check_name: string
          issue_count: number
        }[]
      }
      preview_payment_read_model_import: {
        Args: { p_import_batch_id?: string }
        Returns: {
          check_name: string
          issue_count: number
        }[]
      }
      preview_test_customer_purge: {
        Args: { p_actor_user_id?: string; p_customer_id: string }
        Returns: Json
      }
      recalculate_payment_status_for_root: {
        Args: { p_changed_by: string; p_root_id: string; p_source?: string }
        Returns: undefined
      }
      repair_customer_read_model_owner_assignments: {
        Args: { p_import_batch_id?: string }
        Returns: {
          rows_affected: number
          target_table: string
        }[]
      }
      resolve_customer_read_model_owner: {
        Args: {
          p_owner_email: string
          p_owner_names: string
          p_owner_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      scrub_blocked_vendor_jsonb: { Args: { p_value: Json }; Returns: Json }
      scrub_blocked_vendor_text: { Args: { p_value: string }; Returns: string }
      void_payment_document_and_recalculate_status: {
        Args: { p_document_id: string; p_reason: string; p_voided_by: string }
        Returns: {
          appt_id: string | null
          brand: Database["public"]["Enums"]["brand"]
          created_at: string
          doc_family: Database["public"]["Enums"]["doc_family"]
          doc_number: string
          document_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by: string
          pdf_storage_asset_id: string | null
          pdf_storage_bucket: string | null
          pdf_storage_path: string | null
          root_id: string
          status: Database["public"]["Enums"]["doc_status"]
          superseded_by: string | null
          supersedes: string | null
          tax_enabled: boolean
          updated_at: string
          version: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      artifact_type:
        | "appointment_recording"
        | "diamond_viewing_recording"
        | "client_advisor_recap"
        | "transcript"
        | "summary"
        | "consultation_recap_recording"
        | "diamond_viewing_recap_recording"
        | "general_recording"
      artifact_workflow_stage:
        | "uploaded"
        | "transcription_queued"
        | "transcribing"
        | "transcript_ready"
        | "summary_queued"
        | "summary_ready"
        | "approved"
        | "handed_off"
        | "error"
      booking_source: "acuity" | "calendly" | "manual" | "test"
      brand: "hpusa" | "vvs"
      broadcast_priority: "normal" | "urgent"
      broadcast_target_type: "all" | "role" | "person"
      design_deck_status: "draft" | "published" | "archived"
      design_slide_layout: "cover" | "single_image" | "compare_2up"
      doc_family:
        | "deposit_invoice"
        | "deposit_receipt"
        | "sales_invoice"
        | "sales_receipt"
        | "quotation"
      doc_status: "active" | "voided" | "superseded" | "draft"
      notice_type:
        | "new_booking"
        | "rescheduled"
        | "canceled"
        | "same_day_booking"
        | "field_edit"
      qualification_tier: "none" | "backup" | "primary"
      recording_session_status:
        | "created"
        | "recording"
        | "stopped"
        | "uploading"
        | "uploaded"
        | "failed_upload"
        | "abandoned"
      recording_type:
        | "consultation"
        | "diamond_viewing"
        | "consultation_recap"
        | "diamond_viewing_recap"
        | "general"
      schedule_change_type:
        | "full_day_off"
        | "working"
        | "pto"
        | "sick"
        | "vacation"
      stone_order_status:
        | "proposing"
        | "on_the_way"
        | "delivered"
        | "not_approved"
        | "returned"
        | "sold"
      stone_status: "in_stock" | "out" | "returned" | "sold" | "on_hold"
      storage_asset_purpose:
        | "intake_attachment"
        | "appointment_recording"
        | "diamond_viewing_recording"
        | "transcript_text"
        | "summary_text"
        | "invoice_pdf"
        | "receipt_pdf"
        | "quotation_pdf"
        | "design_render_image"
        | "design_deck_pdf"
        | "design_deck_pptx"
        | "loupe360_upload"
        | "appointment_intake_form_photo"
        | "appointment_inspiration_image"
        | "consultation_recap_recording"
        | "diamond_viewing_recap_recording"
        | "general_recording"
      task_owner_kind: "user" | "role"
      task_status: "pending" | "snoozed" | "completed" | "blocked" | "canceled"
      user_role:
        | "admin"
        | "client_advisor"
        | "joc"
        | "diamond_order_admin"
        | "diamond_order_assistant"
        | "read_only"
        | "wax_request_admin"
        | "marketing"
        | "sales"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      artifact_type: [
        "appointment_recording",
        "diamond_viewing_recording",
        "client_advisor_recap",
        "transcript",
        "summary",
        "consultation_recap_recording",
        "diamond_viewing_recap_recording",
        "general_recording",
      ],
      artifact_workflow_stage: [
        "uploaded",
        "transcription_queued",
        "transcribing",
        "transcript_ready",
        "summary_queued",
        "summary_ready",
        "approved",
        "handed_off",
        "error",
      ],
      booking_source: ["acuity", "calendly", "manual", "test"],
      brand: ["hpusa", "vvs"],
      broadcast_priority: ["normal", "urgent"],
      broadcast_target_type: ["all", "role", "person"],
      design_deck_status: ["draft", "published", "archived"],
      design_slide_layout: ["cover", "single_image", "compare_2up"],
      doc_family: [
        "deposit_invoice",
        "deposit_receipt",
        "sales_invoice",
        "sales_receipt",
        "quotation",
      ],
      doc_status: ["active", "voided", "superseded", "draft"],
      notice_type: [
        "new_booking",
        "rescheduled",
        "canceled",
        "same_day_booking",
        "field_edit",
      ],
      qualification_tier: ["none", "backup", "primary"],
      recording_session_status: [
        "created",
        "recording",
        "stopped",
        "uploading",
        "uploaded",
        "failed_upload",
        "abandoned",
      ],
      recording_type: [
        "consultation",
        "diamond_viewing",
        "consultation_recap",
        "diamond_viewing_recap",
        "general",
      ],
      schedule_change_type: [
        "full_day_off",
        "working",
        "pto",
        "sick",
        "vacation",
      ],
      stone_order_status: [
        "proposing",
        "on_the_way",
        "delivered",
        "not_approved",
        "returned",
        "sold",
      ],
      stone_status: ["in_stock", "out", "returned", "sold", "on_hold"],
      storage_asset_purpose: [
        "intake_attachment",
        "appointment_recording",
        "diamond_viewing_recording",
        "transcript_text",
        "summary_text",
        "invoice_pdf",
        "receipt_pdf",
        "quotation_pdf",
        "design_render_image",
        "design_deck_pdf",
        "design_deck_pptx",
        "loupe360_upload",
        "appointment_intake_form_photo",
        "appointment_inspiration_image",
        "consultation_recap_recording",
        "diamond_viewing_recap_recording",
        "general_recording",
      ],
      task_owner_kind: ["user", "role"],
      task_status: ["pending", "snoozed", "completed", "blocked", "canceled"],
      user_role: [
        "admin",
        "client_advisor",
        "joc",
        "diamond_order_admin",
        "diamond_order_assistant",
        "read_only",
        "wax_request_admin",
        "marketing",
        "sales",
      ],
    },
  },
} as const

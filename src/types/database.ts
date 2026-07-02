// Supabase generate_typescript_types로 생성 (2026-06-22, 마이그레이션 001~030 기준).
// 스키마 변경 시 재생성할 것 — 수동 편집 금지.
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
  public: {
    Tables: {
      lifestyle_content: {
        Row: {
          body_ko: string
          disease: string
          sources: Json
          topic: string
          updated_at: string
        }
        Insert: {
          body_ko: string
          disease: string
          sources?: Json
          topic: string
          updated_at?: string
        }
        Update: {
          body_ko?: string
          disease?: string
          sources?: Json
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_patient_notes: {
        Row: {
          pharmacy_id: string
          patient_id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          pharmacy_id: string
          patient_id: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          pharmacy_id?: string
          patient_id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_requests: {
        Row: {
          contact_phone: string | null
          created_at: string
          id: string
          member_id: string | null
          note: string | null
          patient_ack_at: string | null
          patient_id: string
          pharmacy_id: string
          replied_at: string | null
          reply_text: string | null
          responded_at: string | null
          status: string
          type: string
        }
        Insert: {
          contact_phone?: string | null
          created_at?: string
          id?: string
          member_id?: string | null
          note?: string | null
          patient_ack_at?: string | null
          patient_id: string
          pharmacy_id: string
          replied_at?: string | null
          reply_text?: string | null
          responded_at?: string | null
          status?: string
          type: string
        }
        Update: {
          contact_phone?: string | null
          created_at?: string
          id?: string
          member_id?: string | null
          note?: string | null
          patient_ack_at?: string | null
          patient_id?: string
          pharmacy_id?: string
          replied_at?: string | null
          reply_text?: string | null
          responded_at?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      drug_ingredients: {
        Row: {
          amount: string | null
          drug_id: string
          id: string
          ingredient_code: string | null
          name_en: string
          name_ko: string | null
          position: number
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: string | null
          drug_id: string
          id?: string
          ingredient_code?: string | null
          name_en: string
          name_ko?: string | null
          position?: number
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: string | null
          drug_id?: string
          id?: string
          ingredient_code?: string | null
          name_en?: string
          name_ko?: string | null
          position?: number
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drug_ingredients_drug_id_fkey"
            columns: ["drug_id"]
            isOneToOne: false
            referencedRelation: "drugs"
            referencedColumns: ["id"]
          },
        ]
      }
      drugs: {
        Row: {
          barcode: string | null
          chart: string | null
          edi_code: string | null
          entp_name: string | null
          etc_otc_name: string | null
          form_code_name: string | null
          id: string
          image_url: string | null
          ingredient_code: string | null
          ingredient_name: string | null
          is_canceled: boolean
          item_name: string
          item_seq: string
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          chart?: string | null
          edi_code?: string | null
          entp_name?: string | null
          etc_otc_name?: string | null
          form_code_name?: string | null
          id?: string
          image_url?: string | null
          ingredient_code?: string | null
          ingredient_name?: string | null
          is_canceled?: boolean
          item_name: string
          item_seq: string
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          chart?: string | null
          edi_code?: string | null
          entp_name?: string | null
          etc_otc_name?: string | null
          form_code_name?: string | null
          id?: string
          image_url?: string | null
          ingredient_code?: string | null
          ingredient_name?: string | null
          is_canceled?: boolean
          item_name?: string
          item_seq?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      dur_shadow_logs: {
        Row: {
          created_at: string | null
          drug_ids: string[]
          id: string
          interaction_count: number
          matched_count: number
          ocr_session_id: string | null
          severity_summary: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          drug_ids: string[]
          id?: string
          interaction_count?: number
          matched_count?: number
          ocr_session_id?: string | null
          severity_summary?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          drug_ids?: string[]
          id?: string
          interaction_count?: number
          matched_count?: number
          ocr_session_id?: string | null
          severity_summary?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      interactions: {
        Row: {
          description: string | null
          drug_a_id: string
          drug_b_id: string
          id: string
          severity: string
          source: string
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          drug_a_id: string
          drug_b_id: string
          id?: string
          severity: string
          source?: string
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          drug_a_id?: string
          drug_b_id?: string
          id?: string
          severity?: string
          source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_drug_a_id_fkey"
            columns: ["drug_a_id"]
            isOneToOne: false
            referencedRelation: "drugs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_drug_b_id_fkey"
            columns: ["drug_b_id"]
            isOneToOne: false
            referencedRelation: "drugs"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_check_logs: {
        Row: {
          check_date: string
          id: string
          is_checked: boolean
          logged_at: string | null
          meal_time: string
          member_id: string | null
          schedule_id: string | null
          user_id: string
        }
        Insert: {
          check_date: string
          id?: string
          is_checked: boolean
          logged_at?: string | null
          meal_time: string
          member_id?: string | null
          schedule_id?: string | null
          user_id: string
        }
        Update: {
          check_date?: string
          id?: string
          is_checked?: boolean
          logged_at?: string | null
          meal_time?: string
          member_id?: string | null
          schedule_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_check_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_check_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "medication_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_check_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_schedules: {
        Row: {
          check_date: string
          id: string
          is_checked: boolean
          meal_time: string
          member_id: string | null
          prescription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          check_date: string
          id?: string
          is_checked?: boolean
          meal_time: string
          member_id?: string | null
          prescription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          check_date?: string
          id?: string
          is_checked?: boolean
          meal_time?: string
          member_id?: string | null
          prescription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedules_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_schedules_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "user_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          consent_at: string | null
          created_at: string | null
          id: string
          is_self: boolean
          name: string
          owner_id: string
          relation: string | null
        }
        Insert: {
          consent_at?: string | null
          created_at?: string | null
          id?: string
          is_self?: boolean
          name: string
          owner_id: string
          relation?: string | null
        }
        Update: {
          consent_at?: string | null
          created_at?: string | null
          id?: string
          is_self?: boolean
          name?: string
          owner_id?: string
          relation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacies: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          license_number: string | null
          name: string
          owner_id: string
          phone: string | null
          store_id: string | null
          subscription_status: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          license_number?: string | null
          name: string
          owner_id: string
          phone?: string | null
          store_id?: string | null
          subscription_status?: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          license_number?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          store_id?: string | null
          subscription_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_patients: {
        Row: {
          connected_at: string | null
          consent_given: boolean
          id: string
          patient_id: string
          pharmacy_id: string
        }
        Insert: {
          connected_at?: string | null
          consent_given?: boolean
          id?: string
          patient_id: string
          pharmacy_id: string
        }
        Update: {
          connected_at?: string | null
          consent_given?: boolean
          id?: string
          patient_id?: string
          pharmacy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_patients_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string | null
          id: string
          image_path: string
          ocr_raw: Json | null
          ocr_status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_path: string
          ocr_raw?: Json | null
          ocr_status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_path?: string
          ocr_raw?: Json | null
          ocr_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          alarm_enabled: boolean
          alarm_times: Json
          consent_health: boolean
          consent_health_at: string | null
          consent_pharmacist_view: boolean
          consent_pharmacist_view_at: string | null
          created_at: string | null
          email: string
          font_size: string
          full_name: string | null
          id: string
          phone: string | null
          regular_pharmacy_address: string | null
          regular_pharmacy_id: string | null
          regular_pharmacy_name: string | null
          regular_pharmacy_phone: string | null
          role: string
        }
        Insert: {
          alarm_enabled?: boolean
          alarm_times?: Json
          consent_health?: boolean
          consent_health_at?: string | null
          consent_pharmacist_view?: boolean
          consent_pharmacist_view_at?: string | null
          created_at?: string | null
          email: string
          font_size?: string
          full_name?: string | null
          id: string
          phone?: string | null
          regular_pharmacy_address?: string | null
          regular_pharmacy_id?: string | null
          regular_pharmacy_name?: string | null
          regular_pharmacy_phone?: string | null
          role?: string
        }
        Update: {
          alarm_enabled?: boolean
          alarm_times?: Json
          consent_health?: boolean
          consent_health_at?: string | null
          consent_pharmacist_view?: boolean
          consent_pharmacist_view_at?: string | null
          created_at?: string | null
          email?: string
          font_size?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          regular_pharmacy_address?: string | null
          regular_pharmacy_id?: string | null
          regular_pharmacy_name?: string | null
          regular_pharmacy_phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_regular_pharmacy_id_fkey"
            columns: ["regular_pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      pubmed_cache: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          query_key: string
          raw_results: Json
          summary_ko: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          query_key: string
          raw_results: Json
          summary_ko?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          query_key?: string
          raw_results?: Json
          summary_ko?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplement_interaction_cache: {
        Row: {
          drug_input: string
          fetched_at: string
          id: string
          interaction_count: number
          result: Json
          status: string
          supplement_input: string
        }
        Insert: {
          drug_input: string
          fetched_at?: string
          id?: string
          interaction_count?: number
          result: Json
          status: string
          supplement_input: string
        }
        Update: {
          drug_input?: string
          fetched_at?: string
          id?: string
          interaction_count?: number
          result?: Json
          status?: string
          supplement_input?: string
        }
        Relationships: []
      }
      supplement_interaction_shadow_logs: {
        Row: {
          cache_hit_count: number
          created_at: string | null
          drug_count: number
          drug_normalized_count: number
          id: string
          interaction_found_count: number
          meddata_called_count: number
          ocr_session_id: string | null
          pair_count: number
          severity_summary: Json | null
          supplement_count: number
          supplement_normalized_count: number
          user_id: string | null
        }
        Insert: {
          cache_hit_count?: number
          created_at?: string | null
          drug_count?: number
          drug_normalized_count?: number
          id?: string
          interaction_found_count?: number
          meddata_called_count?: number
          ocr_session_id?: string | null
          pair_count?: number
          severity_summary?: Json | null
          supplement_count?: number
          supplement_normalized_count?: number
          user_id?: string | null
        }
        Update: {
          cache_hit_count?: number
          created_at?: string | null
          drug_count?: number
          drug_normalized_count?: number
          id?: string
          interaction_found_count?: number
          meddata_called_count?: number
          ocr_session_id?: string | null
          pair_count?: number
          severity_summary?: Json | null
          supplement_count?: number
          supplement_normalized_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      supplements: {
        Row: {
          barcode: string | null
          caution: string | null
          company_name: string | null
          id: string
          main_function: string | null
          product_name: string
          product_seq: string
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          caution?: string | null
          company_name?: string | null
          id?: string
          main_function?: string | null
          product_name: string
          product_seq: string
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          caution?: string | null
          company_name?: string | null
          id?: string
          main_function?: string | null
          product_name?: string
          product_seq?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_medications: {
        Row: {
          created_at: string | null
          custom_name: string | null
          deleted_at: string | null
          dose: string | null
          dose_amount: number | null
          doses_per_day: number | null
          dow: number[] | null
          drug_id: string | null
          ended_at: string | null
          frequency: string | null
          has_interaction_warning: boolean | null
          id: string
          ingredient: string | null
          meal_times: string[] | null
          member_id: string | null
          prescription_id: string | null
          schedule_type: string
          source: string
          started_at: string | null
          supplement_id: string | null
          total_days: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          custom_name?: string | null
          deleted_at?: string | null
          dose?: string | null
          dose_amount?: number | null
          doses_per_day?: number | null
          dow?: number[] | null
          drug_id?: string | null
          ended_at?: string | null
          frequency?: string | null
          has_interaction_warning?: boolean | null
          id?: string
          ingredient?: string | null
          meal_times?: string[] | null
          member_id?: string | null
          prescription_id?: string | null
          schedule_type?: string
          source?: string
          started_at?: string | null
          supplement_id?: string | null
          total_days?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          custom_name?: string | null
          deleted_at?: string | null
          dose?: string | null
          dose_amount?: number | null
          doses_per_day?: number | null
          dow?: number[] | null
          drug_id?: string | null
          ended_at?: string | null
          frequency?: string | null
          has_interaction_warning?: boolean | null
          id?: string
          ingredient?: string | null
          meal_times?: string[] | null
          member_id?: string | null
          prescription_id?: string | null
          schedule_type?: string
          source?: string
          started_at?: string | null
          supplement_id?: string | null
          total_days?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_medications_drug_id_fkey"
            columns: ["drug_id"]
            isOneToOne: false
            referencedRelation: "drugs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_medications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_medications_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "user_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_medications_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_medications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prescriptions: {
        Row: {
          created_at: string | null
          department: string | null
          duration_days: number | null
          hospital_name: string | null
          id: string
          institution_code: string | null
          member_id: string | null
          pharmacy_address: string | null
          pharmacy_lat: number | null
          pharmacy_lng: number | null
          pharmacy_name: string | null
          pharmacy_phone: string | null
          prescribed_at: string | null
          raw_medicine_list: Json
          refill_reminded_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          duration_days?: number | null
          hospital_name?: string | null
          id?: string
          institution_code?: string | null
          member_id?: string | null
          pharmacy_address?: string | null
          pharmacy_lat?: number | null
          pharmacy_lng?: number | null
          pharmacy_name?: string | null
          pharmacy_phone?: string | null
          prescribed_at?: string | null
          raw_medicine_list?: Json
          refill_reminded_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          department?: string | null
          duration_days?: number | null
          hospital_name?: string | null
          id?: string
          institution_code?: string | null
          member_id?: string | null
          pharmacy_address?: string | null
          pharmacy_lat?: number | null
          pharmacy_lng?: number | null
          pharmacy_name?: string | null
          pharmacy_phone?: string | null
          prescribed_at?: string | null
          raw_medicine_list?: Json
          refill_reminded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_prescriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      end_expired_medications: { Args: { today: string }; Returns: undefined }
      pharmacist_can_view: { Args: { patient: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

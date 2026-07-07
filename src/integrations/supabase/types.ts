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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          family_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          family_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          family_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_transactions: {
        Row: {
          accepted: boolean
          account_name: string | null
          amount: number | null
          confidence: number | null
          created_at: string
          credit_amount: number | null
          debit_amount: number | null
          description: string | null
          family_id: string
          id: string
          import_file_id: string
          imported_expense_id: string | null
          raw_text: string | null
          reference_number: string | null
          suggested_category: string | null
          transaction_date: string | null
          transaction_type: string | null
        }
        Insert: {
          accepted?: boolean
          account_name?: string | null
          amount?: number | null
          confidence?: number | null
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          family_id: string
          id?: string
          import_file_id: string
          imported_expense_id?: string | null
          raw_text?: string | null
          reference_number?: string | null
          suggested_category?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Update: {
          accepted?: boolean
          account_name?: string | null
          amount?: number | null
          confidence?: number | null
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          family_id?: string
          id?: string
          import_file_id?: string
          imported_expense_id?: string | null
          raw_text?: string | null
          reference_number?: string | null
          suggested_category?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_transactions_import_file_id_fkey"
            columns: ["import_file_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_transactions_imported_expense_id_fkey"
            columns: ["imported_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          family_id: string
          id: string
          notes: string | null
          period_month: number
          period_year: number
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          family_id: string
          id?: string
          notes?: string | null
          period_month: number
          period_year: number
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          family_id?: string
          id?: string
          notes?: string | null
          period_month?: number
          period_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          family_id: string
          icon: string | null
          id: string
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          family_id: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          family_id?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rules: {
        Row: {
          category_id: string
          created_at: string
          family_id: string
          id: string
          keyword: string
          priority: number
        }
        Insert: {
          category_id: string
          created_at?: string
          family_id: string
          id?: string
          keyword: string
          priority?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          family_id?: string
          id?: string
          keyword?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_rules_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          family_id: string
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          family_id: string
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          family_id?: string
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_items: {
        Row: {
          amount: number
          created_at: string
          date: string
          family_id: string
          id: string
          item: string
          linked_expense_id: string | null
          notes: string | null
          payment_account_id: string | null
          status: Database["public"]["Enums"]["credit_card_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          family_id: string
          id?: string
          item: string
          linked_expense_id?: string | null
          notes?: string | null
          payment_account_id?: string | null
          status?: Database["public"]["Enums"]["credit_card_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          family_id?: string
          id?: string
          item?: string
          linked_expense_id?: string | null
          notes?: string | null
          payment_account_id?: string | null
          status?: Database["public"]["Enums"]["credit_card_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_items_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_items_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          date: string
          dedupe_hash: string | null
          description: string
          family_id: string
          id: string
          import_file_id: string | null
          paid_by: string | null
          payment_account_id: string | null
          receipt_path: string | null
          reimbursable: boolean
          reimbursement_status: Database["public"]["Enums"]["reimbursement_status"]
          source: Database["public"]["Enums"]["expense_source"]
          trip_id: string | null
          type: Database["public"]["Enums"]["expense_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          dedupe_hash?: string | null
          description: string
          family_id: string
          id?: string
          import_file_id?: string | null
          paid_by?: string | null
          payment_account_id?: string | null
          receipt_path?: string | null
          reimbursable?: boolean
          reimbursement_status?: Database["public"]["Enums"]["reimbursement_status"]
          source?: Database["public"]["Enums"]["expense_source"]
          trip_id?: string | null
          type?: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          dedupe_hash?: string | null
          description?: string
          family_id?: string
          id?: string
          import_file_id?: string | null
          paid_by?: string | null
          payment_account_id?: string | null
          receipt_path?: string | null
          reimbursable?: boolean
          reimbursement_status?: Database["public"]["Enums"]["reimbursement_status"]
          source?: Database["public"]["Enums"]["expense_source"]
          trip_id?: string | null
          type?: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_import_file_id_fkey"
            columns: ["import_file_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          date_format: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          date_format?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          date_format?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          family_id: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["family_role"]
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          family_id: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["family_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          family_id?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["family_role"]
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_invitations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          display_name: string
          family_id: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          display_name: string
          family_id: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          display_name?: string
          family_id?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_user_roles: {
        Row: {
          created_at: string
          family_id: string
          id: string
          role: Database["public"]["Enums"]["family_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          role?: Database["public"]["Enums"]["family_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          role?: Database["public"]["Enums"]["family_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_user_roles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          current_amount: number
          family_id: string
          id: string
          name: string
          notes: string | null
          target_amount: number
          target_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          family_id: string
          id?: string
          name: string
          notes?: string | null
          target_amount: number
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_amount?: number
          family_id?: string
          id?: string
          name?: string
          notes?: string | null
          target_amount?: number
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      import_files: {
        Row: {
          created_at: string
          family_id: string
          file_name: string | null
          id: string
          imported_count: number
          mime_type: string | null
          notes: string | null
          row_count: number
          source: Database["public"]["Enums"]["expense_source"]
          status: string
          storage_path: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          family_id: string
          file_name?: string | null
          id?: string
          imported_count?: number
          mime_type?: string | null
          notes?: string | null
          row_count?: number
          source: Database["public"]["Enums"]["expense_source"]
          status?: string
          storage_path?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          family_id?: string
          file_name?: string | null
          id?: string
          imported_count?: number
          mime_type?: string | null
          notes?: string | null
          row_count?: number
          source?: Database["public"]["Enums"]["expense_source"]
          status?: string
          storage_path?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_files_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      import_staging_rows: {
        Row: {
          accepted: boolean
          created_at: string
          error: string | null
          family_id: string
          id: string
          import_file_id: string
          is_duplicate: boolean
          parsed: Json | null
          raw: Json
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          error?: string | null
          family_id: string
          id?: string
          import_file_id: string
          is_duplicate?: boolean
          parsed?: Json | null
          raw: Json
        }
        Update: {
          accepted?: boolean
          created_at?: string
          error?: string | null
          family_id?: string
          id?: string
          import_file_id?: string
          is_duplicate?: boolean
          parsed?: Json | null
          raw?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_staging_rows_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_staging_rows_import_file_id_fkey"
            columns: ["import_file_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          active: boolean
          beneficiary_name: string | null
          created_at: string
          family_id: string
          id: string
          masked_number: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          beneficiary_name?: string | null
          created_at?: string
          family_id: string
          id?: string
          masked_number?: string | null
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          beneficiary_name?: string | null
          created_at?: string
          family_id?: string
          id?: string
          masked_number?: string | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_family_id: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_family_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_family_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          auto_create: boolean
          category_id: string | null
          created_at: string
          due_day: number
          family_id: string
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id: string
          item: string
          notes: string | null
          paid_by: string | null
          reminder_days: number
          type: Database["public"]["Enums"]["expense_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          auto_create?: boolean
          category_id?: string | null
          created_at?: string
          due_day?: number
          family_id: string
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          item: string
          notes?: string | null
          paid_by?: string | null
          reminder_days?: number
          type?: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          auto_create?: boolean
          category_id?: string | null
          created_at?: string
          due_day?: number
          family_id?: string
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          item?: string
          notes?: string | null
          paid_by?: string | null
          reminder_days?: number
          type?: Database["public"]["Enums"]["expense_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_payment_status: {
        Row: {
          created_at: string
          expense_id: string | null
          family_id: string
          id: string
          notes: string | null
          paid_on: string | null
          period_index: number
          period_month: number
          period_year: number
          recurring_id: string
          status: Database["public"]["Enums"]["recurring_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          expense_id?: string | null
          family_id: string
          id?: string
          notes?: string | null
          paid_on?: string | null
          period_index?: number
          period_month: number
          period_year: number
          recurring_id: string
          status?: Database["public"]["Enums"]["recurring_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          expense_id?: string | null
          family_id?: string
          id?: string
          notes?: string | null
          paid_on?: string | null
          period_index?: number
          period_month?: number
          period_year?: number
          recurring_id?: string
          status?: Database["public"]["Enums"]["recurring_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_payment_status_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_payment_status_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_payment_status_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          active: boolean
          created_at: string
          end_date: string | null
          family_id: string
          id: string
          name: string
          notes: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          family_id: string
          id?: string
          name: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          family_id?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          chatbot_collapsed: boolean
          created_at: string
          date_format: string
          preferred_currency: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chatbot_collapsed?: boolean
          created_at?: string
          date_format?: string
          preferred_currency?: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chatbot_collapsed?: boolean
          created_at?: string
          date_format?: string
          preferred_currency?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_report_runs: {
        Row: {
          error: string | null
          family_id: string
          id: string
          period_end: string
          period_start: string
          ran_at: string
          recipients: string[]
          status: string
        }
        Insert: {
          error?: string | null
          family_id: string
          id?: string
          period_end: string
          period_start: string
          ran_at?: string
          recipients?: string[]
          status?: string
        }
        Update: {
          error?: string | null
          family_id?: string
          id?: string
          period_end?: string
          period_start?: string
          ran_at?: string
          recipients?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_runs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_settings: {
        Row: {
          created_at: string
          day_of_week: number
          enabled: boolean
          family_id: string
          hour_of_day: number
          id: string
          include_charts: boolean
          include_recurring_unpaid: boolean
          include_reimbursable: boolean
          include_top_categories: boolean
          recipients: string[]
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number
          enabled?: boolean
          family_id: string
          hour_of_day?: number
          id?: string
          include_charts?: boolean
          include_recurring_unpaid?: boolean
          include_reimbursable?: boolean
          include_top_categories?: boolean
          recipients?: string[]
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          enabled?: boolean
          family_id?: string
          hour_of_day?: number
          id?: string
          include_charts?: boolean
          include_recurring_unpaid?: boolean
          include_reimbursable?: boolean
          include_top_categories?: boolean
          recipients?: string[]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_settings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_family_invitation: { Args: { _token: string }; Returns: string }
      category_summary: {
        Args: { _end: string; _family_id: string; _start: string }
        Returns: {
          category_id: string
          category_name: string
          total: number
        }[]
      }
      create_family: { Args: { _name: string }; Returns: string }
      daily_summary: {
        Args: { _end: string; _family_id: string; _start: string }
        Returns: {
          day: string
          total: number
        }[]
      }
      has_family_role: {
        Args: {
          _family_id: string
          _roles: Database["public"]["Enums"]["family_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      invitation_preview: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          family_name: string
          role: Database["public"]["Enums"]["family_role"]
          status: string
        }[]
      }
      is_family_member: {
        Args: { _family_id: string; _user_id: string }
        Returns: boolean
      }
      member_summary: {
        Args: { _end: string; _family_id: string; _start: string }
        Returns: {
          member_id: string
          member_name: string
          total: number
        }[]
      }
      monthly_summary: {
        Args: { _family_id: string; _month: number; _year: number }
        Returns: {
          expense_total: number
          investment_total: number
          reimbursable_total: number
          total: number
        }[]
      }
      seed_family_defaults: { Args: { _family_id: string }; Returns: undefined }
      seed_family_sample_data: { Args: { _family_id: string }; Returns: number }
    }
    Enums: {
      credit_card_status: "unpaid" | "paid" | "reimbursed" | "disputed"
      expense_source:
        | "manual"
        | "text_import"
        | "excel_import"
        | "bank_statement"
        | "recurring"
      expense_type:
        | "expense"
        | "investment"
        | "reimbursement"
        | "income"
        | "transfer"
      family_role: "owner" | "admin" | "member" | "viewer"
      recurring_frequency:
        | "monthly"
        | "quarterly"
        | "yearly"
        | "weekly"
        | "daily"
      recurring_status: "due" | "paid" | "skipped" | "overdue"
      reimbursement_status: "not_applicable" | "pending" | "reimbursed"
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
      credit_card_status: ["unpaid", "paid", "reimbursed", "disputed"],
      expense_source: [
        "manual",
        "text_import",
        "excel_import",
        "bank_statement",
        "recurring",
      ],
      expense_type: [
        "expense",
        "investment",
        "reimbursement",
        "income",
        "transfer",
      ],
      family_role: ["owner", "admin", "member", "viewer"],
      recurring_frequency: [
        "monthly",
        "quarterly",
        "yearly",
        "weekly",
        "daily",
      ],
      recurring_status: ["due", "paid", "skipped", "overdue"],
      reimbursement_status: ["not_applicable", "pending", "reimbursed"],
    },
  },
} as const

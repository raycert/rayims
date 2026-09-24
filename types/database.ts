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
      actions: {
        Row: {
          activity_id: string | null
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          issue_id: string | null
          owner_name: string | null
          priority: string
          project_id: string
          site_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          issue_id?: string | null
          owner_name?: string | null
          priority?: string
          project_id: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          issue_id?: string | null
          owner_name?: string | null
          priority?: string
          project_id?: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_project_site_fk"
            columns: ["project_id", "site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["project_id", "site_id"]
          },
        ]
      }
      activities: {
        Row: {
          activity_type_id: string
          consultant_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          mode: string
          name: string
          next_steps: string | null
          objectives: string | null
          planned_days: number | null
          planned_work: string | null
          project_id: string
          site_id: string | null
          start_date: string | null
          status: string
          updated_at: string
          work_performed: string | null
        }
        Insert: {
          activity_type_id: string
          consultant_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          mode: string
          name: string
          next_steps?: string | null
          objectives?: string | null
          planned_days?: number | null
          planned_work?: string | null
          project_id: string
          site_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          work_performed?: string | null
        }
        Update: {
          activity_type_id?: string
          consultant_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          mode?: string
          name?: string
          next_steps?: string | null
          objectives?: string | null
          planned_days?: number | null
          planned_work?: string | null
          project_id?: string
          site_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          work_performed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_site_fk"
            columns: ["project_id", "site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["project_id", "site_id"]
          },
        ]
      }
      activity_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          action_id: string | null
          activity_id: string | null
          caption: string | null
          created_at: string
          created_by: string | null
          document_review_id: string | null
          file_id: string
          id: string
          issue_id: string | null
          project_id: string
          verification_item_id: string | null
        }
        Insert: {
          action_id?: string | null
          activity_id?: string | null
          caption?: string | null
          created_at?: string
          created_by?: string | null
          document_review_id?: string | null
          file_id: string
          id?: string
          issue_id?: string | null
          project_id: string
          verification_item_id?: string | null
        }
        Update: {
          action_id?: string | null
          activity_id?: string | null
          caption?: string | null
          created_at?: string
          created_by?: string | null
          document_review_id?: string | null
          file_id?: string
          id?: string
          issue_id?: string | null
          project_id?: string
          verification_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_document_review_id_fkey"
            columns: ["document_review_id"]
            isOneToOne: false
            referencedRelation: "document_register"
            referencedColumns: ["latest_review_id"]
          },
          {
            foreignKeyName: "attachments_document_review_id_fkey"
            columns: ["document_review_id"]
            isOneToOne: false
            referencedRelation: "document_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_verification_item_id_fkey"
            columns: ["verification_item_id"]
            isOneToOne: false
            referencedRelation: "verification_items"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_framework_items: {
        Row: {
          document_id: string
          framework_item_id: string
        }
        Insert: {
          document_id: string
          framework_item_id: string
        }
        Update: {
          document_id?: string
          framework_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_framework_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_register"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_framework_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_framework_items_framework_item_id_fkey"
            columns: ["framework_item_id"]
            isOneToOne: false
            referencedRelation: "framework_items"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reviews: {
        Row: {
          created_at: string
          document_version_id: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_version_id: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_version_id?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reviews_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_register"
            referencedColumns: ["latest_version_id"]
          },
          {
            foreignKeyName: "document_reviews_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          file_id: string
          id: string
          notes: string | null
          received_on: string | null
          revision: string | null
          uploaded_by: string | null
          version_no: number
        }
        Insert: {
          created_at?: string
          document_id: string
          file_id: string
          id?: string
          notes?: string | null
          received_on?: string | null
          revision?: string | null
          uploaded_by?: string | null
          version_no: number
        }
        Update: {
          created_at?: string
          document_id?: string
          file_id?: string
          id?: string
          notes?: string | null
          received_on?: string | null
          revision?: string | null
          uploaded_by?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_register"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_code: string | null
          document_type: string | null
          id: string
          is_applicable: boolean
          owner_name: string | null
          project_id: string
          site_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_code?: string | null
          document_type?: string | null
          id?: string
          is_applicable?: boolean
          owner_name?: string | null
          project_id: string
          site_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_code?: string | null
          document_type?: string | null
          id?: string
          is_applicable?: boolean
          owner_name?: string | null
          project_id?: string
          site_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_site_fk"
            columns: ["project_id", "site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["project_id", "site_id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          original_name: string
          project_id: string
          size_bytes: number | null
          storage_key: string
          storage_provider: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          original_name: string
          project_id: string
          size_bytes?: number | null
          storage_key: string
          storage_provider?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          original_name?: string
          project_id?: string
          size_bytes?: number | null
          storage_key?: string
          storage_provider?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_items: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          framework_id: string
          id: string
          item_type: string
          parent_id: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          framework_id: string
          id?: string
          item_type?: string
          parent_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          framework_id?: string
          id?: string
          item_type?: string
          parent_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "framework_items_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "framework_items_parent_fk"
            columns: ["framework_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "framework_items"
            referencedColumns: ["framework_id", "id"]
          },
        ]
      }
      frameworks: {
        Row: {
          category: string | null
          code: string
          created_at: string
          description: string | null
          edition: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          description?: string | null
          edition: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          description?: string | null
          edition?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      issues: {
        Row: {
          activity_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          document_review_id: string | null
          framework_item_id: string | null
          id: string
          priority: string
          project_id: string
          site_id: string | null
          status: string
          title: string
          updated_at: string
          verification_item_id: string | null
        }
        Insert: {
          activity_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_review_id?: string | null
          framework_item_id?: string | null
          id?: string
          priority?: string
          project_id: string
          site_id?: string | null
          status?: string
          title: string
          updated_at?: string
          verification_item_id?: string | null
        }
        Update: {
          activity_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_review_id?: string | null
          framework_item_id?: string | null
          id?: string
          priority?: string
          project_id?: string
          site_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          verification_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_document_review_id_fkey"
            columns: ["document_review_id"]
            isOneToOne: false
            referencedRelation: "document_register"
            referencedColumns: ["latest_review_id"]
          },
          {
            foreignKeyName: "issues_document_review_id_fkey"
            columns: ["document_review_id"]
            isOneToOne: false
            referencedRelation: "document_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_framework_item_id_fkey"
            columns: ["framework_item_id"]
            isOneToOne: false
            referencedRelation: "framework_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_project_site_fk"
            columns: ["project_id", "site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["project_id", "site_id"]
          },
          {
            foreignKeyName: "issues_verification_item_id_fkey"
            columns: ["verification_item_id"]
            isOneToOne: false
            referencedRelation: "verification_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_frameworks: {
        Row: {
          created_at: string
          framework_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          framework_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          framework_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_frameworks_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_frameworks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sites: {
        Row: {
          created_at: string
          notes: string | null
          project_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          project_id: string
          site_id: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          project_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          project_type: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          project_type?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          project_type?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          client_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_items: {
        Row: {
          created_at: string
          created_by: string | null
          document_review_id: string | null
          follows_item_id: string | null
          framework_item_id: string | null
          id: string
          notes: string | null
          priority: string
          project_id: string
          question: string
          result: string | null
          site_id: string | null
          target_activity_id: string | null
          updated_at: string
          verified_activity_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_review_id?: string | null
          follows_item_id?: string | null
          framework_item_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          project_id: string
          question: string
          result?: string | null
          site_id?: string | null
          target_activity_id?: string | null
          updated_at?: string
          verified_activity_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_review_id?: string | null
          follows_item_id?: string | null
          framework_item_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          project_id?: string
          question?: string
          result?: string | null
          site_id?: string | null
          target_activity_id?: string | null
          updated_at?: string
          verified_activity_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_items_document_review_id_fkey"
            columns: ["document_review_id"]
            isOneToOne: false
            referencedRelation: "document_register"
            referencedColumns: ["latest_review_id"]
          },
          {
            foreignKeyName: "verification_items_document_review_id_fkey"
            columns: ["document_review_id"]
            isOneToOne: false
            referencedRelation: "document_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_items_follows_item_id_fkey"
            columns: ["follows_item_id"]
            isOneToOne: false
            referencedRelation: "verification_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_items_framework_item_id_fkey"
            columns: ["framework_item_id"]
            isOneToOne: false
            referencedRelation: "framework_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_items_project_site_fk"
            columns: ["project_id", "site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["project_id", "site_id"]
          },
          {
            foreignKeyName: "verification_items_target_activity_id_fkey"
            columns: ["target_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_items_verified_activity_id_fkey"
            columns: ["verified_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_items_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      document_register: {
        Row: {
          doc_code: string | null
          document_id: string | null
          document_type: string | null
          is_applicable: boolean | null
          latest_review_id: string | null
          latest_revision: string | null
          latest_version_id: string | null
          latest_version_no: number | null
          owner_name: string | null
          project_id: string | null
          site_id: string | null
          status: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_site_fk"
            columns: ["project_id", "site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["project_id", "site_id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {},
  },
} as const

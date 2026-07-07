export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      network_alerts: {
        Row: {
          action_taken: string | null
          category: string
          created_at: string
          description: string | null
          dst_ip: unknown
          id: string
          mitigated_at: string | null
          mitigated_by: string | null
          mitre_id: string | null
          port: number | null
          protocol: string | null
          severity: string
          src_ip: unknown
          status: string
          team_id: string
          timestamp: string | null
          title: string
          payload_entropy: number | null
          blast_radius_nodes: number | null
          previous_hash: string | null
          current_hash: string | null
          hashed_at: string | null
        }
        Insert: {
          action_taken?: string | null
          category: string
          created_at?: string
          description?: string | null
          dst_ip?: unknown
          id?: string
          mitigated_at?: string | null
          mitigated_by?: string | null
          mitre_id?: string | null
          port?: number | null
          protocol?: string | null
          severity: string
          src_ip?: unknown
          status?: string
          team_id: string
          timestamp?: string | null
          title: string
          payload_entropy?: number | null
          blast_radius_nodes?: number | null
          previous_hash?: string | null
          current_hash?: string | null
          hashed_at?: string | null
        }
        Update: {
          action_taken?: string | null
          category?: string
          created_at?: string
          description?: string | null
          dst_ip?: unknown
          id?: string
          mitigated_at?: string | null
          mitigated_by?: string | null
          mitre_id?: string | null
          port?: number | null
          protocol?: string | null
          severity?: string
          src_ip?: unknown
          status?: string
          team_id?: string
          timestamp?: string | null
          title?: string
          payload_entropy?: number | null
          blast_radius_nodes?: number | null
          previous_hash?: string | null
          current_hash?: string | null
          hashed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_alerts_mitigated_by_fkey"
            columns: ["mitigated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_alerts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      honeytoken_traps: {
        Row: {
          id: string
          last_heartbeat: string | null
          status: string
          trap_name: string
          violation_count: number
        }
        Insert: {
          id?: string
          last_heartbeat?: string | null
          status?: string
          trap_name: string
          violation_count?: number
        }
        Update: {
          id?: string
          last_heartbeat?: string | null
          status?: string
          trap_name?: string
          violation_count?: number
        }
        Relationships: []
      }
      packets: {
        Row: {
          captured_at: string
          created_at: string
          dst_ip: unknown
          id: string
          payload_size: number
          protocol: string
          sensor_id: string
          src_ip: unknown
          team_id: string
        }
        Insert: {
          captured_at: string
          created_at?: string
          dst_ip: unknown
          id?: string
          payload_size: number
          protocol: string
          sensor_id: string
          src_ip: unknown
          team_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          dst_ip?: unknown
          id?: string
          payload_size?: number
          protocol?: string
          sensor_id?: string
          src_ip?: unknown
          team_id?: string
        }
        Relationships: []
      }
      sensors: {
        Row: {
          api_key: string
          cpu_usage: number
          created_at: string
          firmware_version: string | null
          id: string
          last_seen: string | null
          link_speed: number
          link_type: string
          location: string | null
          memory_usage: number
          name: string
          packets_per_sec: number
          team_id: string
          uptime_seconds: number
          vram_usage: number
        }
        Insert: {
          api_key: string
          cpu_usage?: number
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_seen?: string | null
          link_speed?: number
          link_type?: string
          location?: string | null
          memory_usage?: number
          name: string
          packets_per_sec?: number
          team_id: string
          uptime_seconds?: number
          vram_usage?: number
        }
        Update: {
          api_key?: string
          cpu_usage?: number
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_seen?: string | null
          link_speed?: number
          link_type?: string
          location?: string | null
          memory_usage?: number
          name?: string
          packets_per_sec?: number
          team_id?: string
          uptime_seconds?: number
          vram_usage?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          role: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          role?: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: string
          team_id?: string | null
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          profile: string
          results: Json | null
          started_at: string
          status: string
          target_subnet: string
          team_id: string
          total_hosts: number | null
          total_open_ports: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          profile?: string
          results?: Json | null
          started_at?: string
          status?: string
          target_subnet: string
          team_id: string
          total_hosts?: number | null
          total_open_ports?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          profile?: string
          results?: Json | null
          started_at?: string
          status?: string
          target_subnet?: string
          team_id?: string
          total_hosts?: number | null
          total_open_ports?: number | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pcap_captures: {
        Row: {
          created_at: string
          end_time: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          start_time: string | null
          team_id: string
          total_packets: number | null
          total_sessions: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          start_time?: string | null
          team_id: string
          total_packets?: number | null
          total_sessions?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          start_time?: string | null
          team_id?: string
          total_packets?: number | null
          total_sessions?: number | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      financial_interceptions: {
        Row: {
          created_at: string
          direction: string
          dst_ip: unknown
          id: string
          killed_at: string | null
          protocol: string
          risk_factor: number
          src_ip: unknown
          status: string
          target_label: string
          team_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          dst_ip: unknown
          id?: string
          killed_at?: string | null
          protocol: string
          risk_factor: number
          src_ip: unknown
          status?: string
          target_label: string
          team_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          dst_ip?: unknown
          id?: string
          killed_at?: string | null
          protocol?: string
          risk_factor?: number
          src_ip?: unknown
          status?: string
          target_label?: string
          team_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type NetworkAlert = Database['public']['Tables']['network_alerts']['Row'] & {
  payload_entropy: number | null
  blast_radius_nodes: number | null
}

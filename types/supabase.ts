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
            daily_notes: {
                Row: {
                    id: string
                    content: string
                    done: boolean
                    created_by: string
                    created_at: string
                    habilita: number
                }
                Insert: {
                    id?: string
                    content: string
                    done?: boolean
                    created_by: string
                    created_at?: string
                    habilita?: number
                }
                Update: {
                    id?: string
                    content?: string
                    done?: boolean
                    created_by?: string
                    created_at?: string
                    habilita?: number
                }
                Relationships: []
            }
            profiles: {
                Row: {
                    id: string
                    updated_at: string | null
                    full_name: string | null
                    role: string | null
                    avatar_url: string | null
                    habilita: number
                }
                Insert: {
                    id: string
                    updated_at?: string | null
                    full_name?: string | null
                    role?: string | null
                    avatar_url?: string | null
                    habilita?: number
                }
                Update: {
                    id?: string
                    updated_at?: string | null
                    full_name?: string | null
                    role?: string | null
                    avatar_url?: string | null
                    habilita?: number
                }
                Relationships: []
            }
            projects: {
                Row: {
                    area: string | null
                    completed_at: string | null
                    completion_analysis: string | null
                    created_at: string | null
                    deadline: string | null
                    description: string | null
                    id: string
                    priority: string | null
                    status: string | null
                    title: string
                    type: string | null
                    upload_link: string | null
                    habilita: number
                }
                Insert: {
                    area?: string | null
                    completed_at?: string | null
                    completion_analysis?: string | null
                    created_at?: string | null
                    deadline?: string | null
                    description?: string | null
                    id?: string
                    priority?: string | null
                    status?: string | null
                    title: string
                    type?: string | null
                    upload_link?: string | null
                    habilita?: number
                }
                Update: {
                    area?: string | null
                    completed_at?: string | null
                    completion_analysis?: string | null
                    created_at?: string | null
                    deadline?: string | null
                    description?: string | null
                    id?: string
                    priority?: string | null
                    status?: string | null
                    title?: string
                    type?: string | null
                    upload_link?: string | null
                    habilita?: number
                }
                Relationships: []
            }
            task_assignees: {
                Row: {
                    assignee_name: string
                    member_id: string | null
                    created_at: string | null
                    id: string
                    task_id: string
                }
                Insert: {
                    assignee_name: string
                    member_id?: string | null
                    created_at?: string | null
                    id?: string
                    task_id: string
                    habilita?: number
                }
                Update: {
                    assignee_name?: string
                    member_id?: string | null
                    created_at?: string | null
                    id?: string
                    task_id?: string
                    habilita?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "task_assignees_member_id_fkey"
                        columns: ["member_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "task_assignees_task_id_fkey"
                        columns: ["task_id"]
                        isOneToOne: false
                        referencedRelation: "tasks"
                        referencedColumns: ["id"]
                    }
                ]
            }
            members: {
                Row: {
                    created_at: string | null
                    email: string | null
                    full_name: string
                    id: string
                    habilita: number
                }
                Insert: {
                    created_at?: string | null
                    email?: string | null
                    full_name: string
                    id?: string
                    habilita?: number
                }
                Update: {
                    created_at?: string | null
                    email?: string | null
                    full_name?: string
                    id?: string
                    habilita?: number
                }
                Relationships: []
            }
            tasks: {
                Row: {
                    created_at: string | null
                    deadline: string | null
                    id: string
                    link: string | null
                    notes: string | null
                    project_id: string | null
                    status: string | null
                    title: string
                    habilita: number
                }
                Insert: {
                    created_at?: string | null
                    deadline?: string | null
                    id?: string
                    link?: string | null
                    notes?: string | null
                    project_id?: string | null
                    status?: string | null
                    title: string
                    habilita?: number
                }
                Update: {
                    created_at?: string | null
                    deadline?: string | null
                    id?: string
                    link?: string | null
                    notes?: string | null
                    project_id?: string | null
                    status?: string | null
                    title?: string
                    habilita?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "tasks_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    }
                ]
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

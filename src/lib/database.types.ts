export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      rennam_counter: {
        Row: { id: number; value: string; revision: string; updated_at: string };
        Insert: { id?: number; value: string; revision?: string; updated_at?: string };
        Update: { id?: number; value?: string; revision?: string; updated_at?: string };
        Relationships: [];
      };
      rennam_clicks: {
        Row: { click_id: string; created_at: string };
        Insert: { click_id: string; created_at?: string };
        Update: { click_id?: string; created_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      rennam_torar: {
        Args: { p_click_id: string };
        Returns: { value: string; revision: string; counted: boolean };
      };
      rennam_contador: {
        Args: Record<PropertyKey, never>;
        Returns: { value: string; revision: string };
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

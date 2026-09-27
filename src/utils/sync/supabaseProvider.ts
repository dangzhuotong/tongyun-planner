import type { SyncProvider, SyncData, SyncCategory } from "./types";
import { sanitizeConfigForSync } from "./types";

interface SupabaseConfig {
  url: string;
  anonKey: string;
  userId?: string;
}

type SupabaseClient = {
  from: (table: string) => {
    select: (columns?: string) => { eq: (col: string, val: any) => { single: () => Promise<{ data: any; error: any }> } };
    upsert: (data: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => Promise<{ error: any }>;
  };
};

export class SupabaseProvider implements SyncProvider {
  readonly type = "supabase" as const;
  readonly displayName = "Supabase";
  private config: SupabaseConfig | null = null;
  private client: SupabaseClient | null = null;
  private _userId: string = "";

  constructor(config?: SupabaseConfig) {
    if (config) this.setConfig(config);
  }

  setConfig(config: SupabaseConfig): void {
    this.config = config;
    this._userId = config.userId || "default";
    localStorage.setItem("tongyun_supabase_url", config.url);
    localStorage.setItem("tongyun_supabase_anon_key", config.anonKey);
    if (config.userId) localStorage.setItem("tongyun_supabase_user_id", config.userId);
    this.client = null;
  }

  loadFromStorage(): void {
    const url = localStorage.getItem("tongyun_supabase_url");
    const anonKey = localStorage.getItem("tongyun_supabase_anon_key");
    const userId = localStorage.getItem("tongyun_supabase_user_id") || "default";
    if (url && anonKey) {
      this.config = { url, anonKey, userId };
      this._userId = userId;
    }
  }

  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;
    if (!this.config) throw new Error("Supabase not configured");

    const { createClient } = await import("@supabase/supabase-js");
    this.client = createClient(this.config.url, this.config.anonKey) as unknown as SupabaseClient;
    return this.client;
  }

  isConfigured(): boolean {
    return !!(this.config?.url && this.config?.anonKey);
  }

  async test(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const { error } = await client.from("tongyun_planner_data").select("id").eq("user_id", this._userId).single();
      return !error || error.code === "PGRST116";
    } catch { return false; }
  }

  async push(data: SyncData): Promise<void> {
    const client = await this.getClient();
    const sanitizedData: SyncData = {
      ...data,
      customizationConfig: sanitizeConfigForSync(data.customizationConfig),
    };
    const { error } = await client.from("tongyun_planner_data").upsert({
      user_id: this._userId,
      data: sanitizedData,
      version: data.version,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) throw new Error(`Supabase push failed: ${error.message}`);
  }

  async pull(_dirtyOnly?: Set<SyncCategory>): Promise<SyncData | null> {
    const client = await this.getClient();
    const { data, error } = await client.from("tongyun_planner_data")
      .select("data, version")
      .eq("user_id", this._userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Supabase pull failed: ${error.message}`);
    }

    return data?.data || null;
  }
}

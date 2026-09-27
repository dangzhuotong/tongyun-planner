/**
 * 旧版同步后端检测与清理（仅用于 v1.1.0 迁移提示）
 */

export function detectLegacySyncBackend(): "supabase" | "http" | null {
  if (typeof localStorage === "undefined") return null;

  const syncBackend = localStorage.getItem("tongyun_sync_backend");
  if (syncBackend === "supabase") return "supabase";
  if (syncBackend === "http") return "http";

  const storageBackend = localStorage.getItem("tongyun_storage_backend");
  if (storageBackend === "supabase") return "supabase";

  const supabaseUrl = localStorage.getItem("tongyun_supabase_url")?.trim();
  const supabaseKey = localStorage.getItem("tongyun_supabase_anon_key")?.trim();
  if (supabaseUrl || supabaseKey) return "supabase";

  const httpUrl = localStorage.getItem("tongyun_http_sync_url")?.trim();
  const httpKey = localStorage.getItem("tongyun_http_sync_key")?.trim();
  if (httpUrl && httpKey) return "http";

  return null;
}

export function clearLegacySyncBackend(): void {
  if (typeof localStorage === "undefined") return;

  localStorage.removeItem("tongyun_supabase_url");
  localStorage.removeItem("tongyun_supabase_anon_key");
  localStorage.removeItem("tongyun_supabase_user_id");
  localStorage.removeItem("tongyun_http_sync_url");
  localStorage.removeItem("tongyun_http_sync_key");

  const syncBackend = localStorage.getItem("tongyun_sync_backend");
  if (syncBackend === "supabase" || syncBackend === "http") {
    localStorage.setItem("tongyun_sync_backend", "none");
  }

  const storageBackend = localStorage.getItem("tongyun_storage_backend");
  if (storageBackend === "supabase") {
    localStorage.setItem("tongyun_storage_backend", "local");
  }
}

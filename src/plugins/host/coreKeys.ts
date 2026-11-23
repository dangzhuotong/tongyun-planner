/**
 * 插件 manifest.storageKeys 不得声明这些键。
 * 这是接口约束，不是进程沙箱：插件若绕过 ctx.storage 直接碰 localStorage，宿主拦不住。
 */
export const CORE_STORAGE_KEYS: readonly string[] = [
  "aero_todos",
  "aero_completed_todos",
  "aero_sticky_notes",
  "aero_pomodoro_logs",
  "aero_customization_config",
  "tongyun_journal",
  "tongyun_countdowns",
  "tongyun_webdav_url",
  "tongyun_webdav_user",
  "tongyun_webdav_pass",
  "tongyun_webdav_fp",
  "tongyun_http_sync_url",
  "tongyun_http_sync_key",
  "tongyun_supabase_url",
  "tongyun_supabase_anon_key",
  "tongyun_supabase_user_id",
  "aiApiKey",
  "providerApiKeys",
  "smtpPass",
  "tongyun_plugin_host_v1",
];

const CORE_SET = new Set(CORE_STORAGE_KEYS);

export function isCoreStorageKey(key: string): boolean {
  return CORE_SET.has(key);
}

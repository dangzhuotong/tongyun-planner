import type { SyncProvider, SyncData, SyncManifest, SyncCategory } from "./types";
import {
  ALL_SYNC_CATEGORIES,
  PULL_CATEGORY_ORDER,
  SYNC_CATEGORY_FILES,
  getLocalManifest,
  getLocalCategoryVersion,
  getCategoryPayload,
  applyCategoryPayload,
  mergeRemoteIntoLocal,
  normalizeSyncData,
  getLocalSyncData,
  reconcileTasksAndCompleted,
  protectAgainstEmptyOverwrite,
} from "./types";
import type { WebDavConfig } from "../../types";
import { invoke } from "@tauri-apps/api/core";

const SYNC_TIMEOUT = 30000;
const MANIFEST_FILE = "manifest.json";
const LEGACY_BACKUP_FILE = "tongyun_planner_backup.json";
const REMOTE_DIR = "TongYunPlanner/";

const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

function invokeWithTimeout<T>(cmd: string, args: Record<string, unknown>, ms = SYNC_TIMEOUT): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  return Promise.race([
    invoke<T>(cmd, args).then((result) => {
      clearTimeout(timeoutId);
      return result;
    }),
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("WebDAV timeout (" + (ms / 1000) + "s)")), ms);
    }),
  ]);
}

async function uploadFile(config: WebDavConfig, filename: string, content: string): Promise<void> {
  if (!config.url || !config.username) throw new Error("WebDAV config incomplete");

  if (isTauri()) {
    await invokeWithTimeout("webdav_upload", {
      url: config.url, username: config.username,
      password: config.password || null, filename, content,
    });
    return;
  }

  const baseUrl = config.url.endsWith("/") ? config.url : config.url + "/";
  const token = btoa(config.username + ":" + (config.password || ""));
  const res = await fetch(baseUrl + filename, {
    method: "PUT",
    headers: { Authorization: "Basic " + token, "Content-Type": "application/json" },
    body: content,
  });
  if (!res.ok) throw new Error("E_HTTP_" + res.status);
}

async function downloadFile(config: WebDavConfig, filename: string): Promise<string> {
  if (!config.url || !config.username) throw new Error("WebDAV config incomplete");

  if (isTauri()) {
    return await invokeWithTimeout<string>("webdav_download", {
      url: config.url, username: config.username,
      password: config.password || null, filename,
    });
  }

  const baseUrl = config.url.endsWith("/") ? config.url : config.url + "/";
  const token = btoa(config.username + ":" + (config.password || ""));
  const res = await fetch(baseUrl + filename, {
    method: "GET",
    headers: { Authorization: "Basic " + token },
  });
  if (res.status === 404) throw new Error("E_NOT_FOUND");
  if (!res.ok) throw new Error("E_HTTP_" + res.status);
  return await res.text();
}

async function ensureDir(config: WebDavConfig, dirname: string): Promise<void> {
  if (!config.url || !config.username) return;

  if (isTauri()) {
    await invokeWithTimeout("webdav_mkcol", {
      url: config.url, username: config.username,
      password: config.password || null, dirname,
    });
    return;
  }

  // Browser fallback: MKCOL via fetch
  const baseUrl = config.url.endsWith("/") ? config.url : config.url + "/";
  const token = btoa(config.username + ":" + (config.password || ""));
  const res = await fetch(baseUrl + dirname, {
    method: "MKCOL",
    headers: { Authorization: "Basic " + token },
  });
  // 405 = already exists, which is fine
  if (!res.ok && res.status !== 405) {
    throw new Error("E_HTTP_" + res.status);
  }
}

async function tryDownload(config: WebDavConfig, filename: string): Promise<string | null> {
  try {
    return await downloadFile(config, filename);
  } catch (e: any) {
    // Tauri invoke rejects with a plain string, not an Error object
    const msg = typeof e === "string" ? e : e?.message || "";
    if (msg.startsWith("E_NOT_FOUND")) return null;
    throw e;
  }
}

export class WebDAVProvider implements SyncProvider {
  readonly type = "webdav" as const;
  readonly displayName = "坚果云 WebDAV";
  private config: WebDavConfig | null = null;

  constructor(config?: WebDavConfig) {
    this.config = config || null;
  }

  setConfig(config: WebDavConfig): void {
    this.config = config;
    localStorage.setItem("tongyun_webdav_url", config.url);
    localStorage.setItem("tongyun_webdav_user", config.username);
    if (config.password) localStorage.setItem("tongyun_webdav_pass", config.password);
  }

  loadFromStorage(): void {
    const url = localStorage.getItem("tongyun_webdav_url");
    const username = localStorage.getItem("tongyun_webdav_user");
    const password = localStorage.getItem("tongyun_webdav_pass");
    if (url && username) {
      this.config = { url, username, password: password || undefined };
    }
  }

  isConfigured(): boolean {
    return !!(this.config?.url && this.config?.username);
  }

  async test(): Promise<boolean> {
    if (!this.config) return false;
    try {
      await ensureDir(this.config, REMOTE_DIR);
      await uploadFile(this.config, REMOTE_DIR + "tongyun_planner_test.txt", "ok");
      return true;
    } catch (_e) { return false; }
  }

  /* ── Multi-file incremental push ── */

  /**
   * Push changed categories only.
   * @param data       Full local SyncData
   * @param dirtyOnly  If provided, only these categories are pushed.
   *                   If omitted, compares local manifest vs remote manifest.
   */
  async push(data: SyncData, dirtyOnly?: Set<SyncCategory>): Promise<void> {
    if (!this.config) throw new Error("WebDAV not configured");

    // Ensure remote directory exists before uploading
    await ensureDir(this.config, REMOTE_DIR);

    const localManifest = getLocalManifest();
    let remoteManifest: SyncManifest | null = null;

    // Determine which categories need pushing
    let toPush: SyncCategory[];
    if (dirtyOnly && dirtyOnly.size > 0) {
      toPush = [...dirtyOnly];
    } else {
      // Compare with remote manifest
      remoteManifest = await this.getRemoteManifest();
      if (remoteManifest) {
        toPush = ALL_SYNC_CATEGORIES.filter(
          cat => localManifest[cat].version > (remoteManifest![cat]?.version || 0)
        );
      } else {
        // No remote manifest — push everything (first sync or migration)
        toPush = [...ALL_SYNC_CATEGORIES];
      }
    }

    // Upload changed files（空本地不得盖掉远端非空）
    const pushed: SyncCategory[] = [];
    for (const cat of toPush) {
      let payload = getCategoryPayload(data, cat);
      const remoteJson = await tryDownload(this.config, REMOTE_DIR + SYNC_CATEGORY_FILES[cat]);
      let remotePayload: unknown = null;
      if (remoteJson) {
        try {
          remotePayload = JSON.parse(remoteJson);
        } catch {
          remotePayload = null;
        }
      }
      const guard = protectAgainstEmptyOverwrite(cat, payload, remotePayload, dirtyOnly?.has(cat) ?? false);
      if (guard.skip) {
        console.warn(`[sync] skip empty overwrite for ${cat}`);
        if (remotePayload != null) {
          applyCategoryPayload(cat, remotePayload);
          if (!remoteManifest) remoteManifest = await this.getRemoteManifest();
          const remoteVer = remoteManifest?.[cat]?.version || 0;
          if (remoteVer > 0) {
            localStorage.setItem("tongyun_cat_ver_" + cat, String(remoteVer));
            localManifest[cat].version = remoteVer;
          }
        }
        continue;
      }
      if (guard.mergedLocal !== undefined) {
        payload = guard.mergedLocal;
        applyCategoryPayload(cat, payload);
      }
      const json = JSON.stringify(payload);
      await uploadFile(this.config, REMOTE_DIR + SYNC_CATEGORY_FILES[cat], json);
      localManifest[cat].size = json.length;
      pushed.push(cat);
    }

    // 若全部被 skip，仍写 manifest（版本可能已对齐远端）
    if (pushed.length > 0 || toPush.length > 0) {
      await uploadFile(this.config, REMOTE_DIR + MANIFEST_FILE, JSON.stringify(localManifest));
    }
  }

  /* ── Multi-file incremental pull ── */

  async pull(dirtyOnly?: Set<SyncCategory>): Promise<SyncData | null> {
    if (!this.config) throw new Error("WebDAV not configured");

    // Try new multi-file format first
    const remoteManifest = await this.getRemoteManifest();

    if (remoteManifest) {
      return this.pullMultiFile(remoteManifest, dirtyOnly);
    }

    // Fall back to legacy single-file format
    return this.pullLegacy();
  }

  private async pullMultiFile(remoteManifest: SyncManifest, dirtyOnly?: Set<SyncCategory>): Promise<SyncData | null> {
    if (!this.config) return null;
    const localData = getLocalSyncData();
    let anyUpdated = false;

    // 使用 PULL_CATEGORY_ORDER（completedTasks 优先），确保 tasks 去重时已完成列表已就位
    for (const cat of PULL_CATEGORY_ORDER) {
      // 跳过用户主动变更的脏分类，避免远端覆盖本地已清空/已完成的正确状态
      if (dirtyOnly?.has(cat)) {
        console.log(`[sync] pull skip dirty category: ${cat}`);
        continue;
      }

      const remoteVer = remoteManifest[cat]?.version || 0;
      if (remoteVer === 0) continue; // 远端不存在该分类文件

      // 本地版本号 >= 远端 → 本地不旧于远端，不拉取（双重防线：dirty 标记丢失后版本号仍能保护）
      const localVer = getLocalCategoryVersion(cat);
      if (localVer >= remoteVer) {
        console.log(`[sync] pull skip newer category: ${cat} (local ${localVer} >= remote ${remoteVer})`);
        continue;
      }

      const json = await tryDownload(this.config!, REMOTE_DIR + SYNC_CATEGORY_FILES[cat]);
      if (!json) continue;

      const remotePayload = JSON.parse(json);
      const localPayload = getCategoryPayload(localData, cat);

      // 远端为主 + 本地补充合并
      const merged = mergeRemoteIntoLocal(cat, remotePayload, localPayload);
      applyCategoryPayload(cat, merged);
      localStorage.setItem("tongyun_cat_ver_" + cat, String(remoteVer));
      anyUpdated = true;
    }

    if (anyUpdated) {
      reconcileTasksAndCompleted();
      return getLocalSyncData();
    }

    return localData;
  }

  /** Legacy: read the old single tongyun_planner_backup.json */
  private async pullLegacy(): Promise<SyncData | null> {
    if (!this.config) return null;
    const json = await tryDownload(this.config, LEGACY_BACKUP_FILE);
    if (!json) {
      // Also try inside REMOTE_DIR
      const json2 = await tryDownload(this.config, REMOTE_DIR + LEGACY_BACKUP_FILE);
      if (!json2) return null;
      return normalizeSyncData(JSON.parse(json2));
    }
    return normalizeSyncData(JSON.parse(json));
  }

  /* ── Manifest helpers ── */

  async getRemoteManifest(): Promise<SyncManifest | null> {
    if (!this.config) return null;
    const json = await tryDownload(this.config, REMOTE_DIR + MANIFEST_FILE);
    if (!json) return null;
    try {
      return JSON.parse(json) as SyncManifest;
    } catch (_e) {
      return null;
    }
  }

  async getRemoteVersion(): Promise<number | null> {
    // Check new manifest first
    const manifest = await this.getRemoteManifest();
    if (manifest) {
      // Return max version across all categories
      return Math.max(...ALL_SYNC_CATEGORIES.map(cat => manifest[cat]?.version || 0));
    }
    // Legacy fallback
    if (!this.config) return null;
    try {
      const text = await downloadFile(this.config, "tongyun_planner_version.txt");
      return parseInt(text.trim(), 10);
    } catch (_e) { return null; }
  }
}

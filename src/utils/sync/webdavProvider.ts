import type { SyncProvider, SyncData, SyncManifest, SyncCategory, SyncConflict } from "./types";
import {
  ALL_SYNC_CATEGORIES,
  PULL_CATEGORY_ORDER,
  SYNC_CATEGORY_FILES,
  getLocalManifest,
  getLocalCategoryVersion,
  bumpCategoryVersion,
  getCategoryPayload,
  applyCategoryPayload,
  mergeRemoteIntoLocal,
  normalizeSyncData,
  getLocalSyncData,
  reconcileTasksAndCompleted,
  protectAgainstEmptyOverwrite,
  sanitizeConfigForSync,
} from "./types";
import type { WebDavConfig } from "../../types";
import { invoke } from "@tauri-apps/api/core";
import {
  remoteFingerprint,
  getFingerprint,
  setFingerprint,
  isRemoteChanged,
  conflictBackupFileName,
} from "./conflict";

export type { SyncConflict } from "./types";

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

export async function statFile(
  config: WebDavConfig,
  filename: string
): Promise<{ exists: boolean; etag: string | null; lastModified: string | null }> {
  if (!config.url || !config.username) throw new Error("WebDAV config incomplete");

  if (isTauri()) {
    return await invokeWithTimeout<{ exists: boolean; etag: string | null; lastModified: string | null }>(
      "webdav_stat",
      {
        url: config.url,
        username: config.username,
        password: config.password || null,
        filename,
      }
    );
  }

  const baseUrl = config.url.endsWith("/") ? config.url : config.url + "/";
  const token = btoa(config.username + ":" + (config.password || ""));
  const res = await fetch(baseUrl + filename, {
    method: "HEAD",
    headers: { Authorization: "Basic " + token },
  });
  if (res.status === 404) {
    return { exists: false, etag: null, lastModified: null };
  }
  if (!res.ok) {
    throw new Error("E_HTTP_" + res.status);
  }
  const etag = res.headers.get("ETag")?.trim() || null;
  const lastModified = res.headers.get("Last-Modified")?.trim() || null;
  return { exists: true, etag, lastModified };
}

export async function downloadWithMeta(
  config: WebDavConfig,
  filename: string
): Promise<{ exists: boolean; content: string; etag: string | null; lastModified: string | null }> {
  if (!config.url || !config.username) throw new Error("WebDAV config incomplete");

  if (isTauri()) {
    const res = await invokeWithTimeout<{ content: string; etag: string | null; lastModified: string | null }>(
      "webdav_download_meta",
      {
        url: config.url,
        username: config.username,
        password: config.password || null,
        filename,
      }
    );
    return { exists: true, ...res };
  }

  const baseUrl = config.url.endsWith("/") ? config.url : config.url + "/";
  const token = btoa(config.username + ":" + (config.password || ""));
  const res = await fetch(baseUrl + filename, {
    method: "GET",
    headers: { Authorization: "Basic " + token },
  });
  if (res.status === 404) throw new Error("E_NOT_FOUND");
  if (!res.ok) throw new Error("E_HTTP_" + res.status);
  const content = await res.text();
  const etag = res.headers.get("ETag")?.trim() || null;
  const lastModified = res.headers.get("Last-Modified")?.trim() || null;
  return { exists: true, content, etag, lastModified };
}

export async function uploadWithMeta(
  config: WebDavConfig,
  filename: string,
  content: string
): Promise<{ exists: boolean; etag: string | null; lastModified: string | null }> {
  if (!config.url || !config.username) throw new Error("WebDAV config incomplete");

  if (isTauri()) {
    return await invokeWithTimeout<{ exists: boolean; etag: string | null; lastModified: string | null }>(
      "webdav_upload_meta",
      {
        url: config.url,
        username: config.username,
        password: config.password || null,
        filename,
        content,
      }
    );
  }

  const baseUrl = config.url.endsWith("/") ? config.url : config.url + "/";
  const token = btoa(config.username + ":" + (config.password || ""));
  const res = await fetch(baseUrl + filename, {
    method: "PUT",
    headers: { Authorization: "Basic " + token, "Content-Type": "application/json; charset=utf-8" },
    body: content,
  });
  if (!res.ok) throw new Error("E_HTTP_" + res.status);
  const etag = res.headers.get("ETag")?.trim() || null;
  const lastModified = res.headers.get("Last-Modified")?.trim() || null;
  return { exists: true, etag, lastModified };
}

async function writeLocalBackup(
  kind: "daily" | "conflicts",
  fileName: string,
  content: string
): Promise<string> {
  if (isTauri()) {
    try {
      return await invokeWithTimeout<string>("local_backup_write", {
        kind,
        fileName,
        content,
      });
    } catch (e) {
      console.warn("[sync] local_backup_write failed:", e);
      return "";
    }
  }
  return "";
}

/**
 * 上传后记录的指纹必须与下次上传前 statFile（HEAD/PROPFIND）得到的指纹同源，
 * 否则部分服务器 PUT 响应里的 ETag 格式与 HEAD 不一致，会造成误报冲突。
 * 因此上传后再 stat 一次；stat 失败时退回 PUT 响应头，最后退回逻辑版本号。
 */
async function fingerprintAfterUpload(
  config: WebDavConfig,
  filename: string,
  uploadRes: { exists: boolean; etag: string | null; lastModified: string | null },
  localVersion: number
): Promise<string> {
  try {
    const meta = await statFile(config, filename);
    const fp = remoteFingerprint(meta, localVersion);
    if (fp) return fp;
  } catch (e) {
    console.warn("[sync] stat after upload failed:", e);
  }
  return remoteFingerprint(uploadRes, localVersion) || "v:" + localVersion;
}

async function uploadFile(config: WebDavConfig, filename: string, content: string): Promise<void> {
  await uploadWithMeta(config, filename, content);
}

async function downloadFile(config: WebDavConfig, filename: string): Promise<string> {
  const file = await downloadWithMeta(config, filename);
  return file.content;
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

  private getAccount(): string {
    if (!this.config) return "";
    return `${this.config.url}|${this.config.username}`;
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

  async statFile(filename: string): Promise<{ exists: boolean; etag: string | null; lastModified: string | null }> {
    if (!this.config) throw new Error("WebDAV not configured");
    return await statFile(this.config, filename);
  }

  async downloadWithMeta(filename: string): Promise<{ exists: boolean; content: string; etag: string | null; lastModified: string | null }> {
    if (!this.config) throw new Error("WebDAV not configured");
    return await downloadWithMeta(this.config, filename);
  }

  async uploadWithMeta(filename: string, content: string): Promise<{ exists: boolean; etag: string | null; lastModified: string | null }> {
    if (!this.config) throw new Error("WebDAV not configured");
    return await uploadWithMeta(this.config, filename, content);
  }

  /* ── Multi-file incremental push with conflict safety ── */

  /**
   * Push changed categories only with conflict detection.
   * @param data       Full local SyncData
   * @param dirtyOnly  If provided, only these categories are pushed.
   *                   If omitted, compares local manifest vs remote manifest.
   */
  async push(data: SyncData, dirtyOnly?: Set<SyncCategory>): Promise<{ conflicts: SyncConflict[] }> {
    if (!this.config) throw new Error("WebDAV not configured");

    // Ensure remote directory exists before uploading
    await ensureDir(this.config, REMOTE_DIR);

    const localManifest = getLocalManifest();
    let remoteManifest: SyncManifest | null = null;

    // Determine which categories need pushing
    let toPush: SyncCategory[];
    if (dirtyOnly && dirtyOnly.size > 0) {
      toPush = [...dirtyOnly];
      remoteManifest = await this.getRemoteManifest();
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

    const mergedManifest: SyncManifest = { ...remoteManifest } as SyncManifest;
    for (const c of ALL_SYNC_CATEGORIES) {
      if (!mergedManifest[c]) {
        mergedManifest[c] = { version: 0 };
      }
    }

    const conflicts: SyncConflict[] = [];
    const account = this.getAccount();
    const now = new Date();
    let anyUploadedOrAligned = false;

    // For each category to push: statFile first; detect remote change
    for (const cat of toPush) {
      const fileName = SYNC_CATEGORY_FILES[cat];
      const remoteFilePath = REMOTE_DIR + fileName;
      const storedFp = getFingerprint(account, fileName);
      const meta = await statFile(this.config, remoteFilePath);
      const remoteVersion = remoteManifest?.[cat]?.version || 0;
      const currentFp = remoteFingerprint(meta, remoteVersion);

      if (isRemoteChanged(storedFp, currentFp, meta.exists)) {
        console.warn(`[sync] conflict detected on ${cat}: storedFp=${storedFp}, currentFp=${currentFp}`);
        let remoteContent = "";
        let remotePayload: unknown = null;
        try {
          const res = await downloadWithMeta(this.config, remoteFilePath);
          remoteContent = res.content;
          remotePayload = JSON.parse(remoteContent);
        } catch (e) {
          console.error(`[sync] download remote content failed for conflict backup:`, e);
        }

        const backupPaths: string[] = [];
        if (remoteContent) {
          const rBackupName = conflictBackupFileName(now, cat, "remote");
          const rPath = await writeLocalBackup("conflicts", rBackupName, remoteContent);
          if (rPath) backupPaths.push(rPath);
        }

        let localPayload = getCategoryPayload(data, cat);
        if (cat === "config") {
          localPayload = sanitizeConfigForSync(localPayload as any);
        }
        const localContent = JSON.stringify(localPayload, null, 2);
        const lBackupName = conflictBackupFileName(now, cat, "local");
        const lPath = await writeLocalBackup("conflicts", lBackupName, localContent);
        if (lPath) backupPaths.push(lPath);

        conflicts.push({
          category: cat,
          fileName,
          remoteContent,
          remotePayload,
          remoteFingerprint: currentFp,
          remoteManifestVersion: remoteVersion,
          backupPaths,
        });
        // DO NOT upload this category
        continue;
      }

      if (currentFp === null && meta.exists) {
        console.warn(`[sync] conflict detection is unavailable for ${cat} on this server`);
      }

      // Existing logic (empty-overwrite guard etc.)
      let payload = getCategoryPayload(data, cat);
      let remotePayload: unknown = null;
      if (meta.exists) {
        try {
          const downloaded = await downloadWithMeta(this.config, remoteFilePath);
          remotePayload = JSON.parse(downloaded.content);
        } catch {
          remotePayload = null;
        }
      }

      const guard = protectAgainstEmptyOverwrite(cat, payload, remotePayload, dirtyOnly?.has(cat) ?? false);
      if (guard.skip) {
        console.warn(`[sync] skip empty overwrite for ${cat}`);
        if (remotePayload != null) {
          applyCategoryPayload(cat, remotePayload);
          if (remoteVersion > 0) {
            localStorage.setItem("tongyun_cat_ver_" + cat, String(remoteVersion));
            localManifest[cat].version = remoteVersion;
            mergedManifest[cat] = { version: remoteVersion };
            anyUploadedOrAligned = true;
          }
        }
        continue;
      }

      if (guard.mergedLocal !== undefined) {
        payload = guard.mergedLocal;
        applyCategoryPayload(cat, payload);
      }
      if (cat === "config") {
        payload = sanitizeConfigForSync(payload as any);
      }

      const json = JSON.stringify(payload);
      const uploadRes = await uploadWithMeta(this.config, remoteFilePath, json);
      const localVersion = getLocalCategoryVersion(cat);
      const newFp = await fingerprintAfterUpload(this.config, remoteFilePath, uploadRes, localVersion);
      setFingerprint(account, fileName, newFp);

      mergedManifest[cat] = { version: localVersion, size: json.length };
      anyUploadedOrAligned = true;
    }

    // Never write manifest entries for conflicted categories; only write if uploaded or aligned
    if (anyUploadedOrAligned) {
      await uploadFile(this.config, REMOTE_DIR + MANIFEST_FILE, JSON.stringify(mergedManifest));
    }

    return { conflicts };
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
    return this.pullLegacy(dirtyOnly);
  }

  private async pullMultiFile(remoteManifest: SyncManifest, dirtyOnly?: Set<SyncCategory>): Promise<SyncData | null> {
    if (!this.config) return null;
    const localData = getLocalSyncData();
    let anyUpdated = false;
    const account = this.getAccount();

    // 使用 PULL_CATEGORY_ORDER（completedTasks 优先），确保 tasks 去重时已完成列表已就位
    for (const cat of PULL_CATEGORY_ORDER) {
      // 跳过用户主动变更的脏分类，避免远端覆盖本地已清空/已完成的正确状态
      if (dirtyOnly?.has(cat)) {
        console.log(`[sync] pull skip dirty category: ${cat}`);
        continue;
      }

      const remoteVer = remoteManifest[cat]?.version || 0;
      if (remoteVer === 0) continue; // 远端不存在该分类文件

      const fileName = SYNC_CATEGORY_FILES[cat];
      const remoteFilePath = REMOTE_DIR + fileName;

      // 本地版本号 >= 远端 → 本地不旧于远端，不拉取（双重防线：dirty 标记丢失后版本号仍能保护）
      const localVer = getLocalCategoryVersion(cat);
      if (localVer >= remoteVer) {
        console.log(`[sync] pull skip newer category: ${cat} (local ${localVer} >= remote ${remoteVer})`);
        const storedFp = getFingerprint(account, fileName);
        if (!storedFp) {
          try {
            const meta = await statFile(this.config, remoteFilePath);
            const fp = remoteFingerprint(meta, remoteVer);
            if (fp) {
              setFingerprint(account, fileName, fp);
            }
          } catch (e) {
            console.warn(`[sync] baseline stat failed for ${cat}:`, e);
          }
        }
        continue;
      }

      let downloaded: { exists: boolean; content: string; etag: string | null; lastModified: string | null } | null;
      try {
        downloaded = await downloadWithMeta(this.config, remoteFilePath);
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message || "";
        if (msg.startsWith("E_NOT_FOUND")) continue;
        throw e;
      }
      if (!downloaded) continue;

      const fp = remoteFingerprint(downloaded, remoteVer);
      if (fp) {
        setFingerprint(account, fileName, fp);
      }

      const remotePayload = JSON.parse(downloaded.content);
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

  /** Legacy: read the old single tongyun_planner_backup.json and apply it locally. */
  private async pullLegacy(dirtyOnly?: Set<SyncCategory>): Promise<SyncData | null> {
    if (!this.config) return null;
    const json =
      (await tryDownload(this.config, LEGACY_BACKUP_FILE)) ||
      (await tryDownload(this.config, REMOTE_DIR + LEGACY_BACKUP_FILE));
    if (!json) return null;
    const data = normalizeSyncData(JSON.parse(json));
    if (!data) return null;

    const localData = getLocalSyncData();
    let anyUpdated = false;
    for (const cat of PULL_CATEGORY_ORDER) {
      if (dirtyOnly?.has(cat)) continue;
      const remotePayload = cat === "config" ? data.customizationConfig : getCategoryPayload(data, cat);
      const localPayload = cat === "config" ? localData.customizationConfig : getCategoryPayload(localData, cat);
      const merged = mergeRemoteIntoLocal(cat, remotePayload, localPayload);
      applyCategoryPayload(cat, merged);
      anyUpdated = true;
    }
    if (anyUpdated) {
      reconcileTasksAndCompleted();
    }
    return getLocalSyncData();
  }

  /* ── Conflict resolution methods ── */

  /**
   * 上传单项分类（用户选择保留本机版本时使用）：
   * 上传并存储指纹，合并 remoteManifest 写入该分类版本号。
   */
  async uploadCategory(cat: SyncCategory, payload: unknown): Promise<void> {
    if (!this.config) throw new Error("WebDAV not configured");
    await ensureDir(this.config, REMOTE_DIR);

    if (cat === "config") {
      payload = sanitizeConfigForSync(payload as any);
    }

    const fileName = SYNC_CATEGORY_FILES[cat];
    const remoteFilePath = REMOTE_DIR + fileName;
    const json = JSON.stringify(payload);

    const uploadRes = await uploadWithMeta(this.config, remoteFilePath, json);
    const localVersion = getLocalCategoryVersion(cat) || bumpCategoryVersion(cat);
    const newFp = await fingerprintAfterUpload(this.config, remoteFilePath, uploadRes, localVersion);
    const account = this.getAccount();
    setFingerprint(account, fileName, newFp);

    const remoteManifest = await this.getRemoteManifest();
    const mergedManifest: SyncManifest = { ...remoteManifest } as SyncManifest;
    for (const c of ALL_SYNC_CATEGORIES) {
      if (!mergedManifest[c]) mergedManifest[c] = { version: 0 };
    }
    mergedManifest[cat] = { version: localVersion, size: json.length };
    await uploadFile(this.config, REMOTE_DIR + MANIFEST_FILE, JSON.stringify(mergedManifest));
  }

  /**
   * 接受云端版本（用户选择保留云端版本时使用）：
   * 解析 remoteContent，完整替换该分类，写入分类版本号与指纹，并重新对齐 tasks 与 completed。
   */
  acceptRemote(conflict: SyncConflict): void {
    let payload = conflict.remotePayload;
    if (!payload && conflict.remoteContent) {
      try {
        payload = JSON.parse(conflict.remoteContent);
      } catch {
        payload = null;
      }
    }

    applyCategoryPayload(conflict.category, payload);

    if (conflict.remoteManifestVersion > 0) {
      localStorage.setItem("tongyun_cat_ver_" + conflict.category, String(conflict.remoteManifestVersion));
    }

    if (conflict.remoteFingerprint) {
      const account = this.getAccount();
      setFingerprint(account, conflict.fileName, conflict.remoteFingerprint);
    }

    reconcileTasksAndCompleted();
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

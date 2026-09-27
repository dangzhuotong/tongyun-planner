import type { SyncProvider, SyncData, SyncManifest, SyncCategory } from "./types";
import {
  ALL_SYNC_CATEGORIES,
  PULL_CATEGORY_ORDER,
  getLocalManifest,
  getLocalCategoryVersion,
  getCategoryPayload,
  applyCategoryPayload,
  mergeRemoteIntoLocal,
  getLocalSyncData,
  reconcileTasksAndCompleted,
  protectAgainstEmptyOverwrite,
  sanitizeConfigForSync,
} from "./types";

export interface HttpSyncConfig {
  /** e.g. http://127.0.0.1:8787 — no trailing path required */
  baseUrl: string;
  apiKey: string;
}

const TIMEOUT_MS = 30_000;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function request<T>(
  config: HttpSyncConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const base = normalizeBaseUrl(config.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-API-Key": config.apiKey,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) {
          detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
        }
      } catch { /* ignore */ }
      const err = new Error(detail) as Error & { status?: number; body?: unknown };
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export class HttpSyncProvider implements SyncProvider {
  readonly type = "http" as const;
  readonly displayName = "自建 Sync 服务";
  private config: HttpSyncConfig | null = null;

  constructor(config?: HttpSyncConfig) {
    this.config = config || null;
  }

  setConfig(config: HttpSyncConfig): void {
    this.config = {
      baseUrl: normalizeBaseUrl(config.baseUrl),
      apiKey: config.apiKey.trim(),
    };
    localStorage.setItem("tongyun_http_sync_url", this.config.baseUrl);
    localStorage.setItem("tongyun_http_sync_key", this.config.apiKey);
  }

  loadFromStorage(): void {
    const baseUrl = localStorage.getItem("tongyun_http_sync_url");
    const apiKey = localStorage.getItem("tongyun_http_sync_key");
    if (baseUrl && apiKey) {
      this.config = { baseUrl: normalizeBaseUrl(baseUrl), apiKey };
    }
  }

  isConfigured(): boolean {
    return !!(this.config?.baseUrl && this.config?.apiKey);
  }

  async test(): Promise<boolean> {
    if (!this.config) return false;
    try {
      await request<{ status: string }>(this.config, "/health");
      // health 不强制鉴权；再用 manifest 验证密钥
      await request(this.config, "/v1/manifest");
      return true;
    } catch {
      return false;
    }
  }

  async getRemoteManifest(): Promise<SyncManifest | null> {
    if (!this.config) return null;
    try {
      const res = await request<{ manifest: Record<string, { version: number }> }>(
        this.config,
        "/v1/manifest"
      );
      const m = {} as SyncManifest;
      for (const cat of ALL_SYNC_CATEGORIES) {
        m[cat] = { version: res.manifest?.[cat]?.version || 0 };
      }
      return m;
    } catch {
      return null;
    }
  }

  /**
   * Push dirty (or locally newer) categories via PUT /v1/categories/{cat}.
   */
  async push(data: SyncData, dirtyOnly?: Set<SyncCategory>): Promise<void> {
    if (!this.config) throw new Error("HTTP sync not configured");

    const localManifest = getLocalManifest();
    let toPush: SyncCategory[];

    if (dirtyOnly && dirtyOnly.size > 0) {
      toPush = [...dirtyOnly];
    } else {
      const remoteManifest = await this.getRemoteManifest();
      if (remoteManifest) {
        toPush = ALL_SYNC_CATEGORIES.filter(
          (cat) => localManifest[cat].version > (remoteManifest[cat]?.version || 0)
        );
      } else {
        toPush = [...ALL_SYNC_CATEGORIES];
      }
    }

    for (const cat of toPush) {
      const remote = await this.fetchCategory(cat);
      const baseVersion = remote?.version ?? 0;
      let payload = getCategoryPayload(data, cat);
      const guard = protectAgainstEmptyOverwrite(cat, payload, remote?.data, dirtyOnly?.has(cat) ?? false);
      if (guard.skip) {
        console.warn(`[sync] skip empty overwrite for ${cat}`);
        if (remote?.data != null) {
          applyCategoryPayload(cat, remote.data);
          localStorage.setItem("tongyun_cat_ver_" + cat, String(remote.version));
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
      const version = Math.max(localManifest[cat].version || 0, Date.now());
      try {
        await request(this.config, `/v1/categories/${cat}`, {
          method: "PUT",
          body: JSON.stringify({
            data: payload,
            version,
            base_version: baseVersion,
          }),
        });
        localStorage.setItem("tongyun_cat_ver_" + cat, String(version));
      } catch (e: unknown) {
        const err = e as Error & { status?: number };
        if (err.status === 409) {
          // 服务端更新：拉取服务端数据，本轮不覆盖
          const latest = await this.fetchCategory(cat);
          if (latest) {
            applyCategoryPayload(cat, latest.data);
            localStorage.setItem("tongyun_cat_ver_" + cat, String(latest.version));
          }
          continue;
        }
        throw e;
      }
    }
  }

  async pull(dirtyOnly?: Set<SyncCategory>): Promise<SyncData | null> {
    if (!this.config) throw new Error("HTTP sync not configured");

    const remoteManifest = await this.getRemoteManifest();
    if (!remoteManifest) return getLocalSyncData();

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
      if (remoteVer === 0) continue; // 远端不存在该分类

      // 本地版本号 >= 远端 → 本地不旧于远端，不拉取（双重防线：dirty 标记丢失后版本号仍能保护）
      const localVer = getLocalCategoryVersion(cat);
      if (localVer >= remoteVer) {
        console.log(`[sync] pull skip newer category: ${cat} (local ${localVer} >= remote ${remoteVer})`);
        continue;
      }

      const doc = await this.fetchCategory(cat);
      if (!doc || doc.data == null) continue;

      const localPayload = getCategoryPayload(localData, cat);
      const merged = mergeRemoteIntoLocal(cat, doc.data, localPayload);
      applyCategoryPayload(cat, merged);
      localStorage.setItem("tongyun_cat_ver_" + cat, String(doc.version));
      anyUpdated = true;
    }

    if (anyUpdated) reconcileTasksAndCompleted();
    return getLocalSyncData();
  }

  private async fetchCategory(
    cat: SyncCategory
  ): Promise<{ version: number; data: unknown } | null> {
    if (!this.config) return null;
    try {
      const doc = await request<{ version: number; data: unknown }>(
        this.config,
        `/v1/categories/${cat}`
      );
      return { version: doc.version || 0, data: doc.data };
    } catch {
      return null;
    }
  }
}

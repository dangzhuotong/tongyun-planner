import type { SyncProvider, SyncBackendType, SyncCategory } from "./types";
import {
  getLocalSyncData,
  getLocalSyncVersion,
  applySyncData,
  normalizeSyncData,
  ALL_SYNC_CATEGORIES,
  SYNC_APPLIED_EVENT,
} from "./types";
import { WebDAVProvider } from "./webdavProvider";
import { SupabaseProvider } from "./supabaseProvider";
import { HttpSyncProvider } from "./httpProvider";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

export interface SyncState {
  backend: SyncBackendType;
  status: SyncStatus;
  lastSyncTime: number | null;
  errorMessage: string | null;
}

type SyncListener = (state: SyncState) => void;

export class SyncEngine {
  readonly webdavProvider: WebDAVProvider;
  readonly supabaseProvider: SupabaseProvider;
  readonly httpProvider: HttpSyncProvider;
  private _currentBackend: SyncBackendType = "none";
  private _status: SyncStatus = "idle";
  private _lastSyncTime: number | null = null;
  private _errorMessage: string | null = null;
  private listeners: Set<SyncListener> = new Set();
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private dirtyCategories: Set<SyncCategory> = new Set();
  private enableAutoSync = false;

  constructor() {
    this.webdavProvider = new WebDAVProvider();
    this.supabaseProvider = new SupabaseProvider();
    this.httpProvider = new HttpSyncProvider();
    this.loadPreferences();
  }

  private loadPreferences(): void {
    this.webdavProvider.loadFromStorage();
    this.supabaseProvider.loadFromStorage();
    this.httpProvider.loadFromStorage();
    const saved = localStorage.getItem("tongyun_sync_backend") as SyncBackendType | null;
    if (saved === "webdav" || saved === "supabase" || saved === "http") {
      this._currentBackend = saved;
    } else {
      // 有 WebDAV 凭据但未选后端时，自动启用 WebDAV
      const url = localStorage.getItem("tongyun_webdav_url");
      const user = localStorage.getItem("tongyun_webdav_user");
      if (url && user) {
        this._currentBackend = "webdav";
      } else if (localStorage.getItem("tongyun_http_sync_url") && localStorage.getItem("tongyun_http_sync_key")) {
        this._currentBackend = "http";
      }
    }
    const lastSync = localStorage.getItem("tongyun_last_sync_time");
    if (lastSync) this._lastSyncTime = parseInt(lastSync, 10);
    const autoSync = localStorage.getItem("tongyun_auto_sync");
    if (autoSync === "true") this.enableAutoSync = true;
  }

  get currentBackend(): SyncBackendType { return this._currentBackend; }
  get status(): SyncStatus { return this._status; }
  get lastSyncTime(): number | null { return this._lastSyncTime; }
  get errorMessage(): string | null { return this._errorMessage; }

  /** Check whether any category is dirty */
  get dirty(): boolean { return this.dirtyCategories.size > 0; }

  setBackend(type: SyncBackendType): void {
    this._currentBackend = type;
    localStorage.setItem("tongyun_sync_backend", type);
    this.notify();
  }

  setAutoSync(enabled: boolean, interval?: number): void {
    this.enableAutoSync = enabled;
    localStorage.setItem("tongyun_auto_sync", enabled ? "true" : "false");
    if (enabled) this.startAutoSync(interval);
    else this.stopAutoSync();
  }

  /**
   * Mark specific categories as dirty.
   * If no categories are specified, marks ALL as dirty (backward compat).
   */
  markDirty(...cats: SyncCategory[]): void {
    if (cats.length === 0) {
      // Legacy call with no args — mark everything
      for (const c of ALL_SYNC_CATEGORIES) this.dirtyCategories.add(c);
    } else {
      for (const c of cats) this.dirtyCategories.add(c);
    }
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    const state: SyncState = {
      backend: this._currentBackend,
      status: this._status,
      lastSyncTime: this._lastSyncTime,
      errorMessage: this._errorMessage,
    };
    this.listeners.forEach(fn => fn(state));
  }

  private getProvider(): SyncProvider | null {
    if (this._currentBackend === "webdav") return this.webdavProvider;
    if (this._currentBackend === "supabase") return this.supabaseProvider;
    if (this._currentBackend === "http") return this.httpProvider;
    return null;
  }

  isConfigured(): boolean {
    const provider = this.getProvider();
    return provider ? provider.isConfigured() : false;
  }

  async testConnection(): Promise<boolean> {
    const provider = this.getProvider();
    if (!provider) return false;
    return await provider.test();
  }

  async sync(): Promise<void> {
    const provider = this.getProvider();
    if (!provider || !provider.isConfigured()) {
      this._errorMessage = "未配置同步后端";
      this._status = "error";
      this.notify();
      return;
    }

    this._status = "syncing";
    this._errorMessage = null;
    this.notify();

    try {
      if (this._currentBackend === "webdav") {
        await this.syncWebDAV();
      } else if (this._currentBackend === "http") {
        await this.syncHttp();
      } else {
        // Supabase still uses single-file approach
        await this.syncSingleFile(provider);
      }

      this._lastSyncTime = Date.now();
      localStorage.setItem("tongyun_last_sync_time", String(this._lastSyncTime));
      localStorage.setItem("aero_last_backup_time", String(this._lastSyncTime));
      this._status = "success";
      this.dirtyCategories.clear();
    } catch (e: any) {
      this._status = "error";
      this._errorMessage = e?.message || "同步失败";
    }

    this.notify();
  }

  /** Multi-file incremental sync for WebDAV */
  private async syncWebDAV(): Promise<void> {
    await this.webdavProvider.pull();
    const freshData = getLocalSyncData();
    if (this.dirtyCategories.size > 0) {
      await this.webdavProvider.push(freshData, this.dirtyCategories);
    } else {
      await this.webdavProvider.push(freshData);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: getLocalSyncData() }));
    }
  }

  /** Category incremental sync against self-hosted TongYun Sync Server */
  private async syncHttp(): Promise<void> {
    await this.httpProvider.pull();
    const freshData = getLocalSyncData();
    if (this.dirtyCategories.size > 0) {
      await this.httpProvider.push(freshData, this.dirtyCategories);
    } else {
      await this.httpProvider.push(freshData);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: getLocalSyncData() }));
    }
  }

  /** Legacy single-file sync for Supabase */
  private async syncSingleFile(provider: SyncProvider): Promise<void> {
    const localVersion = getLocalSyncVersion();
    const localData = getLocalSyncData();
    const rawRemote = await provider.pull();
    const remoteData = rawRemote ? normalizeSyncData(rawRemote) ?? rawRemote : null;
    const remoteVersion = remoteData?.version || 0;

    if (remoteData === null) {
      await provider.push(localData);
    } else if (remoteVersion > localVersion) {
      applySyncData(remoteData);
    } else if (localVersion > remoteVersion || (localVersion === remoteVersion && this.dirty)) {
      await provider.push(localData);
    }
  }

  startAutoSync(intervalMs?: number): void {
    this.stopAutoSync();
    if (!this.enableAutoSync) return;
    const ms = intervalMs !== undefined ? intervalMs : 60000;
    if (ms <= 0) return; // manual mode
    this.autoSyncTimer = setInterval(() => {
      if (this.dirty && this.isConfigured()) {
        this.sync();
      }
    }, ms);
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer !== null) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }
}

export const syncEngine = new SyncEngine();

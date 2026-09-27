import type { SyncProvider, SyncBackendType, SyncCategory, SyncConflict } from "./types";
import {
  getLocalSyncData,
  getCategoryPayload,
  bumpCategoryVersion,
  ALL_SYNC_CATEGORIES,
  SYNC_APPLIED_EVENT,
} from "./types";
import { WebDAVProvider } from "./webdavProvider";

export type SyncStatus = "idle" | "syncing" | "success" | "error" | "conflict" | "offline";

export interface SyncState {
  backend: SyncBackendType;
  status: SyncStatus;
  lastSyncTime: number | null;
  errorMessage: string | null;
  conflicts: SyncConflict[];
}

type SyncListener = (state: SyncState) => void;

const DIRTY_STORAGE_KEY = "tongyun_sync_dirty";

export class SyncEngine {
  readonly webdavProvider: WebDAVProvider;
  private _currentBackend: SyncBackendType = "none";
  private _status: SyncStatus = "idle";
  private _lastSyncTime: number | null = null;
  private _errorMessage: string | null = null;
  private _conflicts: SyncConflict[] = [];
  private listeners: Set<SyncListener> = new Set();
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineListener: (() => void) | null = null;
  private dirtyCategories: Set<SyncCategory> = new Set();
  private enableAutoSync = false;
  /** 当前正在进行的同步（含排队的追加轮次），用于合并并发调用 */
  private running: Promise<void> | null = null;
  private rerunRequested = false;

  constructor() {
    this.webdavProvider = new WebDAVProvider();
    this.loadPreferences();
  }

  private loadPreferences(): void {
    this.webdavProvider.loadFromStorage();
    const saved = localStorage.getItem("tongyun_sync_backend") as string | null;
    if (saved === "webdav") {
      this._currentBackend = "webdav";
    } else if (saved === "supabase" || saved === "http") {
      this._currentBackend = "none";
    } else {
      // 有 WebDAV 凭据但未选后端时，自动启用 WebDAV
      const url = localStorage.getItem("tongyun_webdav_url");
      const user = localStorage.getItem("tongyun_webdav_user");
      if (url && user) {
        this._currentBackend = "webdav";
      } else {
        this._currentBackend = "none";
      }
    }
    const lastSync = localStorage.getItem("tongyun_last_sync_time");
    if (lastSync) this._lastSyncTime = parseInt(lastSync, 10);
    const autoSync = localStorage.getItem("tongyun_auto_sync");
    if (autoSync === "true") this.enableAutoSync = true;

    // Load persisted dirty categories
    this.dirtyCategories = this.loadDirtyCategories();
  }

  private loadDirtyCategories(): Set<SyncCategory> {
    if (typeof localStorage === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(DIRTY_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((c: string) => ALL_SYNC_CATEGORIES.includes(c as SyncCategory)));
      }
    } catch {
      // ignore parse error
    }
    return new Set();
  }

  private saveDirtyCategories(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(DIRTY_STORAGE_KEY, JSON.stringify([...this.dirtyCategories]));
  }

  get currentBackend(): SyncBackendType { return this._currentBackend; }
  get status(): SyncStatus { return this._status; }
  get lastSyncTime(): number | null { return this._lastSyncTime; }
  get errorMessage(): string | null { return this._errorMessage; }
  get conflicts(): SyncConflict[] { return this._conflicts; }

  /** Check whether any category is dirty */
  get dirty(): boolean { return this.dirtyCategories.size > 0; }

  setBackend(type: SyncBackendType): void {
    this._currentBackend = type;
    localStorage.setItem("tongyun_sync_backend", type);
    this.notify();
  }

  setAutoSync(enabled: boolean): void {
    this.enableAutoSync = enabled;
    localStorage.setItem("tongyun_auto_sync", enabled ? "true" : "false");
    if (enabled) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  /**
   * Mark specific categories as dirty.
   * If no categories are specified, marks ALL as dirty (backward compat).
   * Restarts the 30s debounced sync timer.
   */
  markDirty(...cats: SyncCategory[]): void {
    if (cats.length === 0) {
      // Legacy call with no args — mark everything
      for (const c of ALL_SYNC_CATEGORIES) this.dirtyCategories.add(c);
    } else {
      for (const c of cats) this.dirtyCategories.add(c);
    }
    this.saveDirtyCategories();

    if (this.enableAutoSync) {
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        if (this.dirty && this.isConfigured() && this._conflicts.length === 0) {
          this.sync();
        }
      }, 30000);
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
      conflicts: this._conflicts,
    };
    this.listeners.forEach(fn => fn(state));
  }

  private getProvider(): SyncProvider | null {
    if (this._currentBackend === "webdav") return this.webdavProvider;
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

  /**
   * 执行一次同步。并发调用不会并行跑：正在同步时再次调用会在本轮结束后追加一轮，
   * 且返回的 Promise 会等到追加轮次也完成（flush/退出前刷盘依赖这一点）。
   */
  async sync(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerunRequested = false;
          await this.doSync();
        } while (this.rerunRequested);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async doSync(): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this._status = "offline";
      this.notify();
      return;
    }

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
      let hasConflicts = false;
      if (this._currentBackend === "webdav") {
        hasConflicts = await this.syncWebDAV();
      }

      if (!hasConflicts) {
        this._lastSyncTime = Date.now();
        localStorage.setItem("tongyun_last_sync_time", String(this._lastSyncTime));
        localStorage.setItem("aero_last_backup_time", String(this._lastSyncTime));
        this._status = "success";
      }
    } catch (e: any) {
      this._status = "error";
      this._errorMessage = e?.message || "同步失败";
    }

    this.notify();
  }

  /** Multi-file incremental sync for WebDAV with conflict awareness */
  private async syncWebDAV(): Promise<boolean> {
    // pull 时跳过脏分类，避免远端数据覆盖用户本地的主动变更（如清空、完成等）
    await this.webdavProvider.pull(this.dirtyCategories);

    if (this.dirtyCategories.size > 0) {
      const freshData = getLocalSyncData();
      const toPush = new Set(this.dirtyCategories);
      const { conflicts } = await this.webdavProvider.push(freshData, toPush);

      // 成功上传的分类从脏列表中移除，冲突分类保留在脏列表
      const conflictedCats = new Set(conflicts.map(c => c.category));
      for (const cat of toPush) {
        if (!conflictedCats.has(cat)) {
          this.dirtyCategories.delete(cat);
        }
      }
      this.saveDirtyCategories();

      if (conflicts.length > 0) {
        this._conflicts = conflicts;
        this._status = "conflict";
        return true;
      }
    }

    this._conflicts = [];
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: getLocalSyncData() }));
    }
    return false;
  }

  /**
   * 解决冲突：
   * choice === "local": 强制使用本地最新数据覆盖云端，更新指纹与清单；
   * choice === "remote": 强制使用云端冲突快照覆盖本地，并重新计算完成态。
   */
  async resolveConflicts(choice: "local" | "remote"): Promise<void> {
    if (this._conflicts.length === 0) return;

    try {
      if (choice === "local") {
        const freshData = getLocalSyncData();
        for (const conflict of this._conflicts) {
          // 选择本机版本：刷新版本戳为当前时间，保证其他设备的清单比较能拉到这份数据
          bumpCategoryVersion(conflict.category);
          const payload = getCategoryPayload(freshData, conflict.category);
          await this.webdavProvider.uploadCategory(conflict.category, payload);
        }
      } else {
        for (const conflict of this._conflicts) {
          this.webdavProvider.acceptRemote(conflict);
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: getLocalSyncData() }));
        }
      }

      // 移除已解决的脏标记并清空冲突
      for (const conflict of this._conflicts) {
        this.dirtyCategories.delete(conflict.category);
      }
      this.saveDirtyCategories();

      this._conflicts = [];
      this._status = "success";
      this._lastSyncTime = Date.now();
      localStorage.setItem("tongyun_last_sync_time", String(this._lastSyncTime));
      localStorage.setItem("aero_last_backup_time", String(this._lastSyncTime));
      this._errorMessage = null;
      this.notify();
    } catch (e: any) {
      this._status = "error";
      this._errorMessage = e?.message || "解决冲突失败";
      this.notify();
      throw e;
    }
  }

  /**
   * 退出前 / 窗口隐藏前将待同步数据强制刷入云端。
   * 若无冲突且配置正常，运行 sync() 与超时时间做 race，永不 reject。
   */
  async flush(timeoutMs: number): Promise<void> {
    if (!this.isConfigured() || !this.dirty || this._conflicts.length > 0) {
      return;
    }
    try {
      let timer: ReturnType<typeof setTimeout>;
      await Promise.race([
        this.sync(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      clearTimeout(timer!);
    } catch (e) {
      console.warn("[sync] flush encountered error:", e);
    }
  }

  private startAutoSync(): void {
    this.stopAutoSync();
    if (!this.enableAutoSync) return;

    // 每 5 分钟同步一次：即使本机无改动也拉取其他设备的更新，有待上传内容时一并补传
    this.autoSyncTimer = setInterval(() => {
      if (this.isConfigured() && this._conflicts.length === 0) {
        this.sync();
      }
    }, 300000);

    // 监听网络恢复事件
    if (typeof window !== "undefined") {
      this.onlineListener = () => {
        if (this.dirty && this.isConfigured() && this._conflicts.length === 0) {
          this.sync();
        }
      };
      window.addEventListener("online", this.onlineListener);
    }
  }

  private stopAutoSync(): void {
    if (this.autoSyncTimer !== null) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.onlineListener !== null && typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineListener);
      this.onlineListener = null;
    }
  }
}

export const syncEngine = new SyncEngine();

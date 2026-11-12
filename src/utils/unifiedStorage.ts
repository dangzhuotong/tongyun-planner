import { initializeDomainDatabase } from "../data/domainDatabase";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const PENDING_PREFIX = "tongyun_sqlite_pending:";

const DB_NAME = "sqlite:tongyun_planner.db";

function getAllKnownKeys(): string[] {
  return [
    "aero_todos",
    "aero_completed_todos",
    "aero_sticky_notes",
    "aero_pomodoro_logs",
    "aero_customization_config",
    "aero_alert_sound_type",
    "tongyun_countdowns",
    "tongyun_journal",
    "tongyun_journal_add_todo",
    "tongyun_ai_praise",
    "tongyun_webdav_url",
    "tongyun_webdav_user",
    "tongyun_webdav_pass",
    "tongyun_webdav_fp",
    "tongyun_sync_backend",
    "tongyun_remote_dsn",
    "tongyun_last_remote_sync_time",
    "aero_last_backup_time",
    "tongyun_sync_version",
    "tongyun_last_updated",
    "tongyun_last_sync_time",
    "tongyun_auto_sync",
    // 分类 LWW 版本戳：缺失会导致空本地盖掉远端
    "tongyun_cat_ver_tasks",
    "tongyun_cat_ver_completedTasks",
    "tongyun_cat_ver_stickyNotes",
    "tongyun_cat_ver_pomodoroLogs",
    "tongyun_cat_ver_countdowns",
    "tongyun_cat_ver_journal",
    "tongyun_cat_ver_config",
    "tongyun_widget_split",
    "tongyun_locale",
    "tongyun_nickname",
    "pomodoro_focus_duration",
    "pomodoro_break_duration",
    // 侧栏 & 番茄
    "tongyun_sidebar_collapsed",
    "tongyun_random_break",
    "tongyun_auto_noise",
    // 资讯偏好
    "tongyun_news_bookmarks",
    "tongyun_news_history",
    "tongyun_news_font_size",
    "tongyun_news_font_family",
    "tongyun_news_columns",
    "tongyun_rss_feeds",
    "tongyun_explore_feeds",
    "tongyun_cors_proxy",
    "tongyun_recollect_prose",
    // 日历 & 白噪音
    "tongyun_timeblocks",
    "tongyun_saved_task_views",
    // 日历轻量记账（issue #51 第 3 项）
    "tongyun_ledger_entries",
    "tongyun_visible_noises",
    // 邮件
    "tongyun_email_config",
    "tongyun_storage_backend",
    // 旧版同步后端（仅用于 v1.1.0 迁移提示检测）
    "tongyun_supabase_url",
    "tongyun_supabase_anon_key",
    "tongyun_supabase_user_id",
    "tongyun_http_sync_url",
    "tongyun_http_sync_key",
    // 分析 & 快速任务
    "tongyun_daily_goal",
    "tongyun_analytics_report",
    "tongyun_last_quick_category",
    // 习惯打卡
    "tongyun_habits",
    // 系统提醒
    "tongyun_due_remind_enabled",
    "tongyun_due_remind_before_min",
    // AI 缓存（当日类，跨设备恢复有意义）
    "tongyun_hitokoto_hourly",
    "tongyun_history_today",
    "tongyun_ai_daily_suggestion",
    "tongyun_ai_daily_prose",
    "tongyun_ai_weekly_review",
  ];
}

export class UnifiedStorage {
  private db: any = null;
  private readyPromise: Promise<void> | null = null;
  private flushTimer: number | null = null;
  private dirtyKeys = new Set<string>();
  private writeQueue: Promise<void> = Promise.resolve();

  private origGetItem: ((key: string) => string | null) | null = null;
  private origSetItem: ((key: string, value: string) => void) | null = null;
  private origRemoveItem: ((key: string) => void) | null = null;

  private overridden = false;
  private initialized = false;

  async init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this._init();
    return this.readyPromise;
  }

  private async _init(): Promise<void> {
    this.origGetItem = localStorage.getItem.bind(localStorage);
    this.origSetItem = localStorage.setItem.bind(localStorage);
    this.origRemoveItem = localStorage.removeItem.bind(localStorage);

    if (!isTauri()) {
      return;
    }

    try {
      const { default: Database } = await import("@tauri-apps/plugin-sql");
      this.db = await Database.load(DB_NAME);

      await this.db.execute(
        `CREATE TABLE IF NOT EXISTS storage (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`,
      );

      const rows: { key: string; value: string }[] = await this.db.select(
        "SELECT key, value FROM storage",
      );
      const sqliteKeys = new Set<string>();

      // A WebView can close after localStorage changes but before the SQLite debounce.
      // Keep that pending change (including a removal) authoritative across restarts.
      for (let i = 0; i < localStorage.length; i++) {
        const marker = localStorage.key(i);
        if (marker?.startsWith(PENDING_PREFIX))
          this.dirtyKeys.add(marker.slice(PENDING_PREFIX.length));
      }
      for (const row of rows) {
        sqliteKeys.add(row.key);
        if (this.origGetItem!(PENDING_PREFIX + row.key) !== null) {
          this.dirtyKeys.add(row.key);
        } else if (this.origGetItem!(row.key) !== row.value) {
          this.origSetItem!(row.key, row.value);
        }
      }

      const knownKeys = getAllKnownKeys();
      for (const key of knownKeys) {
        if (!sqliteKeys.has(key) && !this.dirtyKeys.has(key)) {
          const local = this.origGetItem!(key);
          if (local !== null) {
            try {
              await this.db.execute("INSERT OR IGNORE INTO storage (key, value) VALUES ($1, $2)", [
                key,
                local,
              ]);
            } catch {
              /* ignore DB insert error */
            }
          }
        }
      }

      await initializeDomainDatabase();
      this.initialized = true;
    } catch (e) {
      console.warn("SQLite init failed, localStorage only", e);
    } finally {
      this.overrideLocalStorage();
      if (this.dirtyKeys.size) this.scheduleFlush();
    }
  }

  private overrideLocalStorage(): void {
    if (this.overridden) return;
    this.overridden = true;

    const _getItem = this.origGetItem!;
    const _setItem = this.origSetItem!;
    const _removeItem = this.origRemoveItem!;
    const _dirtyKeys = this.dirtyKeys;
    const _scheduleFlush = this.scheduleFlush.bind(this);

    const markPending = (key: string) => {
      _setItem(PENDING_PREFIX + key, globalThis.crypto.randomUUID());
      _dirtyKeys.add(key);
      _scheduleFlush();
    };

    const setLocal = (key: string, value: string): void => {
      if (_getItem(key) === value) return;
      markPending(key);
      _setItem(key, value);
    };
    const removeLocal = (key: string): void => {
      if (_getItem(key) === null) return;
      markPending(key);
      _removeItem(key);
    };

    // Web Storage uses named properties; assignment on the instance can be treated
    // as a storage key. Intercept the real methods and leave sessionStorage alone.
    if (typeof Storage !== "undefined" && localStorage instanceof Storage) {
      const target = localStorage;
      const nativeSet = Storage.prototype.setItem;
      const nativeRemove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === target) setLocal(String(key), String(value));
        else nativeSet.call(this, key, value);
      };
      Storage.prototype.removeItem = function (key) {
        if (this === target) removeLocal(String(key));
        else nativeRemove.call(this, key);
      };
    } else {
      localStorage.setItem = setLocal;
      localStorage.removeItem = removeLocal;
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 300);
  }

  private async flush(): Promise<void> {
    if (!this.db || this.dirtyKeys.size === 0) return;

    const keys = Array.from(this.dirtyKeys);
    this.dirtyKeys.clear();

    this.writeQueue = this.writeQueue.then(async () => {
      for (const key of keys) {
        try {
          const markerKey = PENDING_PREFIX + key;
          const marker = this.origGetItem!(markerKey);
          if (marker === null) continue; // another window already flushed it
          const value = this.origGetItem!(key);
          if (value !== null) {
            await this.db.execute("INSERT OR REPLACE INTO storage (key, value) VALUES ($1, $2)", [
              key,
              value,
            ]);
          } else {
            await this.db.execute("DELETE FROM storage WHERE key = $1", [key]);
          }
          if (this.origGetItem!(markerKey) === marker) this.origRemoveItem!(markerKey);
          else if (this.origGetItem!(key) !== value) {
            // A newer write may have already been flushed by another window.
            if (this.origGetItem!(markerKey) === null) {
              this.origSetItem!(markerKey, globalThis.crypto.randomUUID());
            }
            this.dirtyKeys.add(key);
            this.scheduleFlush();
          }
        } catch (e) {
          this.dirtyKeys.add(key);
          console.error(`SQLite flush failed for "${key}"`, e);
        }
      }
    });

    await this.writeQueue;
  }

  isMirrorReady(): boolean {
    return this.initialized && this.overridden;
  }

  hasPendingMirrorWrite(key: string): boolean {
    return this.origGetItem?.(PENDING_PREFIX + key) != null;
  }

  async flushNow(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirtyKeys.size > 0) await this.flush();
    await this.writeQueue;
  }
}

export const storage = new UnifiedStorage();

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const DB_NAME = 'sqlite:tongyun_planner.db';

function getAllKnownKeys(): string[] {
  return [
    'aero_todos', 'aero_completed_todos',
    'aero_sticky_notes', 'aero_pomodoro_logs',
    'aero_customization_config', 'aero_alert_sound_type',
    'tongyun_countdowns',
    'tongyun_journal', 'tongyun_journal_add_todo',
    'tongyun_ai_praise',
    'tongyun_webdav_url', 'tongyun_webdav_user', 'tongyun_webdav_pass',
    'tongyun_http_sync_url', 'tongyun_http_sync_key', 'tongyun_sync_backend',
    'aero_last_backup_time', 'tongyun_sync_version', 'tongyun_last_updated',
    'tongyun_last_sync_time', 'tongyun_auto_sync',
    // 分类 LWW 版本戳：缺失会导致空本地盖掉远端
    'tongyun_cat_ver_tasks', 'tongyun_cat_ver_completedTasks',
    'tongyun_cat_ver_stickyNotes', 'tongyun_cat_ver_pomodoroLogs',
    'tongyun_cat_ver_countdowns', 'tongyun_cat_ver_journal', 'tongyun_cat_ver_config',
    'tongyun_widget_split', 'tongyun_locale', 'tongyun_nickname',
    'pomodoro_focus_duration', 'pomodoro_break_duration',
    // 侧栏 & 番茄
    'tongyun_sidebar_collapsed', 'tongyun_random_break', 'tongyun_auto_noise',
    // 资讯偏好
    'tongyun_news_bookmarks', 'tongyun_news_history',
    'tongyun_news_font_size', 'tongyun_news_font_family', 'tongyun_news_columns',
    'tongyun_rss_feeds', 'tongyun_explore_feeds', 'tongyun_cors_proxy',
    'tongyun_recollect_prose',
    // 日历 & 白噪音
    'tongyun_timeblocks', 'tongyun_visible_noises',
    // 邮件 & Supabase 云端
    'tongyun_email_config',
    'tongyun_supabase_url', 'tongyun_supabase_anon_key', 'tongyun_supabase_user_id',
    'tongyun_storage_backend',
    // 分析 & 快速任务
    'tongyun_daily_goal', 'tongyun_analytics_report', 'tongyun_last_quick_category',
    // 习惯打卡
    'tongyun_habits',
    // 系统提醒
    'tongyun_due_remind_enabled', 'tongyun_due_remind_before_min',
    // AI 缓存（当日类，跨设备恢复有意义）
    'tongyun_hitokoto_hourly', 'tongyun_history_today',
    'tongyun_ai_daily_suggestion', 'tongyun_ai_daily_prose',
    'tongyun_ai_weekly_review',
  ];
}

class UnifiedStorage {
  private db: any = null;
  private readyPromise: Promise<void> | null = null;
  private flushTimer: number | null = null;
  private dirtyKeys = new Set<string>();
  private writeQueue: Promise<void> = Promise.resolve();

  private origGetItem: ((key: string) => string | null) | null = null;
  private origSetItem: ((key: string, value: string) => void) | null = null;
  private origRemoveItem: ((key: string) => void) | null = null;

  private overridden = false;

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
      const { default: Database } = await import('@tauri-apps/plugin-sql');
      this.db = await Database.load(DB_NAME);

      await this.db.execute(
        `CREATE TABLE IF NOT EXISTS storage (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      );

      const rows: { key: string; value: string }[] = await this.db.select(
        'SELECT key, value FROM storage'
      );
      const sqliteKeys = new Set<string>();

      if (rows.length > 0) {
        for (const row of rows) {
          sqliteKeys.add(row.key);
          const local = this.origGetItem!(row.key);
          if (local !== row.value) {
            this.origSetItem!(row.key, row.value);
          }
        }
      }

      const knownKeys = getAllKnownKeys();
      for (const key of knownKeys) {
        if (!sqliteKeys.has(key)) {
          const local = this.origGetItem!(key);
          if (local !== null) {
            try {
              await this.db.execute(
                'INSERT OR IGNORE INTO storage (key, value) VALUES ($1, $2)',
                [key, local]
              );
            } catch { /* ignore DB insert error */ }
          }
        }
      }

      this.overrideLocalStorage();
    } catch (e) {
      console.warn('SQLite init failed, localStorage only', e);
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

    localStorage.getItem = ((key: string): string | null => {
      return _getItem(key);
    }) as typeof localStorage.getItem;

    localStorage.setItem = ((key: string, value: string): void => {
      _setItem(key, value);
      _dirtyKeys.add(key);
      _scheduleFlush();
    }) as typeof localStorage.setItem;

    localStorage.removeItem = ((key: string): void => {
      _removeItem(key);
      _dirtyKeys.add(key);
      _scheduleFlush();
    }) as typeof localStorage.removeItem;
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
          const value = this.origGetItem!(key);
          if (value !== null) {
            await this.db.execute(
              'INSERT OR REPLACE INTO storage (key, value) VALUES ($1, $2)',
              [key, value]
            );
          } else {
            await this.db.execute(
              'DELETE FROM storage WHERE key = $1',
              [key]
            );
          }
        } catch (e) {
          console.error(`SQLite flush failed for "${key}"`, e);
        }
      }
    });

    await this.writeQueue;
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

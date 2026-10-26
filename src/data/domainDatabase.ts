import type Database from "@tauri-apps/plugin-sql";
import type {
  CountdownEvent,
  HabitItem,
  JournalEntry,
  PomodoroLog,
  StickyNote,
  Task,
  TimeBlock,
} from "../types";
import { safeJsonParse } from "../utils/json";

const DB_NAME = "sqlite:tongyun_planner.db";
export const SCHEMA_VERSION = 3;

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let databasePromise: Promise<Database | null> | null = null;
let domainWriteQueue: Promise<void> = Promise.resolve();
let dbOverrideForTesting: Database | null = null;

export function setDatabaseOverrideForTesting(db: Database | null): void {
  dbOverrideForTesting = db;
}

export function getDomainDatabase(): Promise<Database | null> {
  if (dbOverrideForTesting) return Promise.resolve(dbOverrideForTesting);
  if (!isTauri()) return Promise.resolve(null);
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: DatabaseClass }) => DatabaseClass.load(DB_NAME))
      .catch((error) => {
        console.warn("Domain database unavailable", error);
        return null;
      });
  }
  return databasePromise;
}

export function queueDomainWrite(work: (db: Database) => Promise<void>): Promise<void> {
  domainWriteQueue = domainWriteQueue.then(async () => {
    const db = await getDomainDatabase();
    if (db) await work(db);
  });
  return domainWriteQueue;
}

export async function createSchema(db: Database): Promise<void> {
  // Migration metadata
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS migration_backups (
    source_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);

  // Legacy domain tables (preserved for backward compatibility and rollback safety)
  await db.execute(`CREATE TABLE IF NOT EXISTS domain_tasks (
    id TEXT PRIMARY KEY,
    completed_at INTEGER,
    due_date TEXT,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL,
    assignee_kind TEXT,
    assignee_agent_id TEXT,
    run_status TEXT
  )`);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_domain_tasks_completed ON domain_tasks(completed_at)",
  );
  await db.execute("CREATE INDEX IF NOT EXISTS idx_domain_tasks_due ON domain_tasks(due_date)");

  await db.execute(`CREATE TABLE IF NOT EXISTS domain_journal (
    id TEXT PRIMARY KEY,
    entry_date TEXT NOT NULL,
    is_daily INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_domain_journal_date ON domain_journal(entry_date)",
  );

  await db.execute(`CREATE TABLE IF NOT EXISTS domain_pomodoro_logs (
    id TEXT PRIMARY KEY,
    occurred_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_domain_pomodoro_time ON domain_pomodoro_logs(occurred_at)",
  );

  await db.execute(`CREATE TABLE IF NOT EXISTS domain_habits (
    id TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS domain_agents (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    meta TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS domain_task_dispatch (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    pipeline_task_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_dispatch_task ON domain_task_dispatch(task_id)");
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_dispatch_status ON domain_task_dispatch(status)",
  );

  // ==========================================
  // P0 Full Schema (2026-10-25 定稿无业务 KV)
  // ==========================================

  // 1. tasks (待办主表)
  await db.execute(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    category TEXT NOT NULL DEFAULT 'urgent-important',
    due_date TEXT,
    due_time TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    repeat_rule TEXT,
    repeat_anchor_day INTEGER,
    priority TEXT DEFAULT 'medium',
    energy_level TEXT,
    estimated_pomodoros INTEGER,
    journal_id TEXT,
    completed_at INTEGER,
    assignee_kind TEXT DEFAULT 'human',
    assignee_agent_id TEXT,
    run_status TEXT,
    stamp TEXT,
    time_block_start TEXT,
    time_block_end TEXT,
    subtasks_json TEXT,
    tags_json TEXT,
    depends_on_json TEXT,
    attachments_json TEXT,
    data TEXT,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_at)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_agent_id)");

  // 2. journal_entries (手帐日记与笔记正文)
  await db.execute(`CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    link_key TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    entry_date TEXT NOT NULL,
    is_daily INTEGER NOT NULL DEFAULT 1,
    mood TEXT,
    ai_comment TEXT,
    template_id TEXT,
    washi_tape TEXT,
    stamp TEXT,
    stickers_json TEXT,
    attachments_json TEXT,
    data TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date)",
  );
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_journal_entries_link ON journal_entries(link_key)",
  );

  // 3. pomodoro_logs (专注番茄记录)
  await db.execute(`CREATE TABLE IF NOT EXISTS pomodoro_logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    task_id TEXT,
    task_title TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    deleted_at INTEGER,
    data TEXT
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_pomodoro_logs_time ON pomodoro_logs(timestamp)");

  // 4. habits (习惯养成定义)
  await db.execute(`CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT,
    done_today INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    last_done_date TEXT,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    data TEXT
  )`);

  // 5. agents (AI/工人名册)
  await db.execute(`CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    meta TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`);

  // 6. task_dispatch (任务派发队列与历史)
  await db.execute(`CREATE TABLE IF NOT EXISTS task_dispatch (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    pipeline_task_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_task_dispatch_task ON task_dispatch(task_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_task_dispatch_status ON task_dispatch(status)");

  // 7. sticky_notes (便签便利贴)
  await db.execute(`CREATE TABLE IF NOT EXISTS sticky_notes (
    id TEXT PRIMARY KEY,
    title TEXT,
    text TEXT NOT NULL,
    color TEXT NOT NULL,
    rotate REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    data TEXT
  )`);

  // 8. countdowns (倒计时事件)
  await db.execute(`CREATE TABLE IF NOT EXISTS countdowns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    target_date TEXT NOT NULL,
    emoji TEXT,
    color TEXT,
    is_lunar INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    data TEXT
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_countdowns_target ON countdowns(target_date)");

  // 9. timeblocks (时间块与日历规划)
  await db.execute(`CREATE TABLE IF NOT EXISTS timeblocks (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    task_id TEXT,
    title TEXT NOT NULL,
    color TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    data TEXT
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_timeblocks_date ON timeblocks(date)");

  // 10. user_prefs (单行用户偏好配置，敏感凭据绝不入库明文)
  await db.execute(`CREATE TABLE IF NOT EXISTS user_prefs (
    id INTEGER PRIMARY KEY DEFAULT 1,
    locale TEXT DEFAULT 'zh-CN',
    nickname TEXT,
    theme_mode TEXT DEFAULT 'auto',
    customization_json TEXT,
    pomodoro_focus_duration INTEGER DEFAULT 25,
    pomodoro_break_duration INTEGER DEFAULT 5,
    alert_sound_type TEXT DEFAULT 'ding',
    sidebar_collapsed INTEGER DEFAULT 0,
    random_break INTEGER DEFAULT 0,
    auto_noise INTEGER DEFAULT 0,
    daily_goal INTEGER,
    due_remind_enabled INTEGER DEFAULT 1,
    due_remind_before_min INTEGER DEFAULT 15,
    updated_at INTEGER NOT NULL
  )`);

  // 11. sync_state (实体同步状态与版本戳)
  await db.execute(`CREATE TABLE IF NOT EXISTS sync_state (
    entity TEXT PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    last_sync_at INTEGER,
    backend TEXT
  )`);

  // 12. sync_outbox (待推远端变更出件箱)
  await db.execute(`CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op TEXT NOT NULL,
    payload TEXT,
    created_at INTEGER NOT NULL
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity)");
}

async function backupLocalValue(db: Database, key: string, value: string | null): Promise<void> {
  if (value === null) return;
  await db.execute(
    "INSERT OR IGNORE INTO migration_backups(source_key, payload, created_at) VALUES ($1, $2, $3)",
    [key, value, Date.now()],
  );
}

export async function migrateLegacyData(db: Database): Promise<void> {
  // Schema V1 migration
  const appliedV1 = await db.select<{ version: number }[]>(
    "SELECT version FROM schema_migrations WHERE version = 1",
  );
  if (appliedV1.length === 0) {
    const taskRaw = typeof localStorage !== "undefined" ? localStorage.getItem("aero_todos") : null;
    const completedRaw =
      typeof localStorage !== "undefined" ? localStorage.getItem("aero_completed_todos") : null;
    const journalRaw =
      typeof localStorage !== "undefined" ? localStorage.getItem("tongyun_journal") : null;
    const pomodoroRaw =
      typeof localStorage !== "undefined" ? localStorage.getItem("aero_pomodoro_logs") : null;
    const habitsRaw =
      typeof localStorage !== "undefined" ? localStorage.getItem("tongyun_habits") : null;

    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const [key, value] of [
        ["aero_todos", taskRaw],
        ["aero_completed_todos", completedRaw],
        ["tongyun_journal", journalRaw],
        ["aero_pomodoro_logs", pomodoroRaw],
        ["tongyun_habits", habitsRaw],
      ] as const) {
        await backupLocalValue(db, key, value);
      }

      const tasks = safeJsonParse<Task[]>(taskRaw || "[]", []);
      const completed = safeJsonParse<Task[]>(completedRaw || "[]", []);
      for (const task of [...tasks, ...completed]) {
        await db.execute(
          `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data, assignee_kind, assignee_agent_id, run_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            task.id,
            task.completedAt ?? null,
            task.dueDate ?? null,
            task.completedAt ?? Date.now(),
            JSON.stringify(task),
            task.assigneeKind ?? (task.assigneeAgentId ? "agent" : "human"),
            task.assigneeAgentId ?? null,
            task.runStatus ?? null,
          ],
        );
      }

      for (const entry of safeJsonParse<JournalEntry[]>(journalRaw || "[]", [])) {
        await db.execute(
          `INSERT OR REPLACE INTO domain_journal(id, entry_date, is_daily, updated_at, data)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            entry.id,
            entry.date,
            entry.isDaily ? 1 : 0,
            entry.updatedAt ?? entry.createdAt ?? Date.now(),
            JSON.stringify(entry),
          ],
        );
      }

      for (const log of safeJsonParse<PomodoroLog[]>(pomodoroRaw || "[]", [])) {
        await db.execute(
          "INSERT OR REPLACE INTO domain_pomodoro_logs(id, occurred_at, data) VALUES ($1, $2, $3)",
          [log.id, log.timestamp, JSON.stringify(log)],
        );
      }

      for (const habit of safeJsonParse<HabitItem[]>(habitsRaw || "[]", [])) {
        await db.execute(
          "INSERT OR REPLACE INTO domain_habits(id, updated_at, data) VALUES ($1, $2, $3)",
          [habit.id, Date.now(), JSON.stringify(habit)],
        );
      }

      await db.execute("INSERT INTO schema_migrations(version, applied_at) VALUES (1, $1)", [
        Date.now(),
      ]);
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  // Schema V2 migration
  const appliedV2 = await db.select<{ version: number }[]>(
    "SELECT version FROM schema_migrations WHERE version = 2",
  );
  if (appliedV2.length === 0) {
    const tableInfo = await db.select<{ name: string }[]>("PRAGMA table_info(domain_tasks)");
    const cols = new Set(tableInfo.map((c) => c.name));
    if (!cols.has("assignee_kind")) {
      await db.execute("ALTER TABLE domain_tasks ADD COLUMN assignee_kind TEXT");
    }
    if (!cols.has("assignee_agent_id")) {
      await db.execute("ALTER TABLE domain_tasks ADD COLUMN assignee_agent_id TEXT");
    }
    if (!cols.has("run_status")) {
      await db.execute("ALTER TABLE domain_tasks ADD COLUMN run_status TEXT");
    }

    const existingAgents = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM domain_agents",
    );
    if (existingAgents.length === 0 || existingAgents[0].count === 0) {
      await db.execute(
        `INSERT OR IGNORE INTO domain_agents(id, handle, kind, enabled, meta, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["agent_local_assistant", "本地助手", "manual", 1, "{}", Date.now()],
      );
    }

    await db.execute(
      "INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (2, $1)",
      [Date.now()],
    );
  }

  // Schema V3 migration: P0 Full Schema (tasks, journal_entries, etc.)
  const appliedV3 = await db.select<{ version: number }[]>(
    "SELECT version FROM schema_migrations WHERE version = 3",
  );
  if (appliedV3.length === 0) {
    await db.execute("BEGIN IMMEDIATE");
    try {
      // 1. Migrate tasks from domain_tasks
      const domainTasks = await db
        .select<
          {
            id: string;
            completed_at: number | null;
            due_date: string | null;
            updated_at: number;
            data: string;
            assignee_kind: string | null;
            assignee_agent_id: string | null;
            run_status: string | null;
          }[]
        >(
          "SELECT id, completed_at, due_date, updated_at, data, assignee_kind, assignee_agent_id, run_status FROM domain_tasks",
        )
        .catch(() => []);

      for (const dt of domainTasks) {
        const task = safeJsonParse<Partial<Task>>(dt.data, {});
        await db.execute(
          `INSERT OR REPLACE INTO tasks (
            id, title, description, notes, category, due_date, due_time,
            is_favorite, is_pinned, repeat_rule, repeat_anchor_day, priority,
            energy_level, estimated_pomodoros, journal_id, completed_at,
            assignee_kind, assignee_agent_id, run_status, stamp,
            time_block_start, time_block_end, subtasks_json, tags_json,
            depends_on_json, attachments_json, data, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
          )`,
          [
            dt.id,
            task.title || "未命名任务",
            task.description ?? null,
            task.notes ?? null,
            task.category || "urgent-important",
            dt.due_date ?? task.dueDate ?? null,
            task.dueTime ?? null,
            task.isFavorite ? 1 : 0,
            task.isPinned ? 1 : 0,
            task.repeat ?? null,
            task.repeatAnchorDay ?? null,
            task.priority || "medium",
            task.energyLevel ?? null,
            task.estimatedPomodoros ?? null,
            task.journalId ?? null,
            dt.completed_at ?? task.completedAt ?? null,
            dt.assignee_kind || task.assigneeKind || "human",
            dt.assignee_agent_id || task.assigneeAgentId || null,
            dt.run_status || task.runStatus || null,
            task.stamp ?? null,
            task.timeBlock?.start ?? null,
            task.timeBlock?.end ?? null,
            JSON.stringify(task.subtasks || []),
            JSON.stringify(task.tags || []),
            JSON.stringify(task.dependsOn || []),
            JSON.stringify(task.attachments || []),
            dt.data,
            dt.updated_at || Date.now(),
          ],
        );
      }

      // 2. Migrate journal from domain_journal
      const domainJournal = await db
        .select<
          {
            id: string;
            entry_date: string;
            is_daily: number;
            updated_at: number;
            data: string;
          }[]
        >("SELECT id, entry_date, is_daily, updated_at, data FROM domain_journal")
        .catch(() => []);

      for (const dj of domainJournal) {
        const entry = safeJsonParse<Partial<JournalEntry>>(dj.data, {});
        await db.execute(
          `INSERT OR REPLACE INTO journal_entries (
            id, link_key, title, body, entry_date, is_daily, mood,
            ai_comment, template_id, washi_tape, stamp, stickers_json,
            attachments_json, data, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )`,
          [
            dj.id,
            entry.linkKey || dj.entry_date,
            entry.title || "未命名手帐",
            entry.content || "",
            dj.entry_date,
            dj.is_daily,
            entry.mood ?? null,
            entry.aiComment ?? null,
            entry.templateId ?? null,
            entry.washiTape ?? null,
            entry.stamp ?? null,
            JSON.stringify(entry.stickers || []),
            JSON.stringify(entry.attachments || []),
            dj.data,
            entry.createdAt || dj.updated_at || Date.now(),
            dj.updated_at || Date.now(),
          ],
        );
      }

      // 3. Migrate pomodoro logs
      const domainPomodoro = await db
        .select<
          {
            id: string;
            occurred_at: number;
            data: string;
          }[]
        >("SELECT id, occurred_at, data FROM domain_pomodoro_logs")
        .catch(() => []);

      for (const dp of domainPomodoro) {
        const log = safeJsonParse<Partial<PomodoroLog>>(dp.data, {});
        await db.execute(
          `INSERT OR REPLACE INTO pomodoro_logs (id, timestamp, duration, task_id, task_title, created_at, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            dp.id,
            log.timestamp || dp.occurred_at,
            log.duration || 25,
            log.taskId ?? null,
            log.taskTitle ?? null,
            dp.occurred_at,
            dp.data,
          ],
        );
      }

      // 4. Migrate habits
      const domainHabits = await db
        .select<
          {
            id: string;
            updated_at: number;
            data: string;
          }[]
        >("SELECT id, updated_at, data FROM domain_habits")
        .catch(() => []);

      for (const dh of domainHabits) {
        const habit = safeJsonParse<Partial<HabitItem>>(dh.data, {});
        await db.execute(
          `INSERT OR REPLACE INTO habits (id, name, emoji, done_today, streak, last_done_date, updated_at, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            dh.id,
            habit.name || "习惯",
            habit.emoji || "✨",
            habit.doneToday ? 1 : 0,
            habit.streak || 0,
            habit.lastDoneDate ?? null,
            dh.updated_at || Date.now(),
            dh.data,
          ],
        );
      }

      // 5. Migrate agents
      const domainAgents = await db
        .select<
          {
            id: string;
            handle: string;
            kind: string;
            enabled: number;
            meta: string;
            updated_at: number;
          }[]
        >("SELECT id, handle, kind, enabled, meta, updated_at FROM domain_agents")
        .catch(() => []);

      for (const da of domainAgents) {
        await db.execute(
          `INSERT OR REPLACE INTO agents (id, handle, kind, enabled, meta, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [da.id, da.handle, da.kind, da.enabled, da.meta, da.updated_at],
        );
      }
      if (domainAgents.length === 0) {
        await db.execute(
          `INSERT OR IGNORE INTO agents(id, handle, kind, enabled, meta, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ["agent_local_assistant", "本地助手", "manual", 1, "{}", Date.now()],
        );
      }

      // 6. Migrate task dispatch
      const domainDispatches = await db
        .select<
          {
            id: string;
            task_id: string;
            agent_id: string;
            status: string;
            note: string | null;
            pipeline_task_id: string | null;
            created_at: number;
            updated_at: number;
          }[]
        >(
          "SELECT id, task_id, agent_id, status, note, pipeline_task_id, created_at, updated_at FROM domain_task_dispatch",
        )
        .catch(() => []);

      for (const dd of domainDispatches) {
        await db.execute(
          `INSERT OR REPLACE INTO task_dispatch (id, task_id, agent_id, status, note, pipeline_task_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            dd.id,
            dd.task_id,
            dd.agent_id,
            dd.status,
            dd.note,
            dd.pipeline_task_id,
            dd.created_at,
            dd.updated_at,
          ],
        );
      }

      // 7. Migrate sticky notes from localStorage
      if (typeof localStorage !== "undefined") {
        const notesRaw = localStorage.getItem("aero_sticky_notes");
        if (notesRaw) {
          const notes = safeJsonParse<StickyNote[]>(notesRaw, []);
          for (const n of notes) {
            await db.execute(
              `INSERT OR REPLACE INTO sticky_notes (id, title, text, color, rotate, updated_at, data)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                n.id,
                n.title ?? null,
                n.text,
                n.color,
                n.rotate || 0,
                Date.now(),
                JSON.stringify(n),
              ],
            );
          }
        }

        // 8. Migrate countdowns from localStorage
        const countdownsRaw = localStorage.getItem("tongyun_countdowns");
        if (countdownsRaw) {
          const events = safeJsonParse<CountdownEvent[]>(countdownsRaw, []);
          for (const e of events) {
            await db.execute(
              `INSERT OR REPLACE INTO countdowns (id, title, target_date, emoji, color, is_lunar, updated_at, data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                e.id,
                e.title,
                e.targetDate,
                e.emoji ?? null,
                e.color ?? null,
                e.isLunar ? 1 : 0,
                Date.now(),
                JSON.stringify(e),
              ],
            );
          }
        }

        // 9. Migrate timeblocks from localStorage
        const timeblocksRaw = localStorage.getItem("tongyun_timeblocks");
        if (timeblocksRaw) {
          const blocks = safeJsonParse<TimeBlock[]>(timeblocksRaw, []);
          for (const b of blocks) {
            await db.execute(
              `INSERT OR REPLACE INTO timeblocks (id, date, start_time, end_time, task_id, title, color, updated_at, data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                b.id,
                b.date,
                b.startTime,
                b.endTime,
                b.taskId ?? null,
                b.title,
                b.color,
                Date.now(),
                JSON.stringify(b),
              ],
            );
          }
        }

        // 10. Migrate user_prefs
        const customConfigRaw = localStorage.getItem("aero_customization_config");
        const localeRaw = localStorage.getItem("tongyun_locale");
        const nicknameRaw = localStorage.getItem("tongyun_nickname");
        const focusRaw = localStorage.getItem("pomodoro_focus_duration");
        const breakRaw = localStorage.getItem("pomodoro_break_duration");
        const soundRaw = localStorage.getItem("aero_alert_sound_type");
        await db.execute(
          `INSERT OR REPLACE INTO user_prefs (
            id, locale, nickname, customization_json,
            pomodoro_focus_duration, pomodoro_break_duration, alert_sound_type, updated_at
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7)`,
          [
            localeRaw || "zh-CN",
            nicknameRaw ?? null,
            customConfigRaw ?? null,
            focusRaw ? parseInt(focusRaw, 10) : 25,
            breakRaw ? parseInt(breakRaw, 10) : 5,
            soundRaw || "ding",
            Date.now(),
          ],
        );
      }

      await db.execute(
        "INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (3, $1)",
        [Date.now()],
      );
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

export async function initializeDomainDatabase(): Promise<void> {
  const db = await getDomainDatabase();
  if (!db) return;
  await createSchema(db);
  await migrateLegacyData(db);
}

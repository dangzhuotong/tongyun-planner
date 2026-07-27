import type Database from "@tauri-apps/plugin-sql";
import type { HabitItem, JournalEntry, PomodoroLog, Task } from "../types";
import { safeJsonParse } from "../utils/json";

const DB_NAME = "sqlite:tongyun_planner.db";
const SCHEMA_VERSION = 1;

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let databasePromise: Promise<Database | null> | null = null;
let domainWriteQueue: Promise<void> = Promise.resolve();

export function getDomainDatabase(): Promise<Database | null> {
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

async function createSchema(db: Database): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS migration_backups (
    source_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS domain_tasks (
    id TEXT PRIMARY KEY,
    completed_at INTEGER,
    due_date TEXT,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_domain_tasks_completed ON domain_tasks(completed_at)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_domain_tasks_due ON domain_tasks(due_date)");
  await db.execute(`CREATE TABLE IF NOT EXISTS domain_journal (
    id TEXT PRIMARY KEY,
    entry_date TEXT NOT NULL,
    is_daily INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_domain_journal_date ON domain_journal(entry_date)");
  await db.execute(`CREATE TABLE IF NOT EXISTS domain_pomodoro_logs (
    id TEXT PRIMARY KEY,
    occurred_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_domain_pomodoro_time ON domain_pomodoro_logs(occurred_at)");
  await db.execute(`CREATE TABLE IF NOT EXISTS domain_habits (
    id TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`);
}

async function backupLocalValue(db: Database, key: string, value: string | null): Promise<void> {
  if (value === null) return;
  await db.execute(
    "INSERT OR IGNORE INTO migration_backups(source_key, payload, created_at) VALUES ($1, $2, $3)",
    [key, value, Date.now()],
  );
}

async function migrateLegacyData(db: Database): Promise<void> {
  const applied = await db.select<{ version: number }[]>(
    "SELECT version FROM schema_migrations WHERE version = $1",
    [SCHEMA_VERSION],
  );
  if (applied.length > 0) return;

  const taskRaw = localStorage.getItem("aero_todos");
  const completedRaw = localStorage.getItem("aero_completed_todos");
  const journalRaw = localStorage.getItem("tongyun_journal");
  const pomodoroRaw = localStorage.getItem("aero_pomodoro_logs");
  const habitsRaw = localStorage.getItem("tongyun_habits");

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
        `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [task.id, task.completedAt ?? null, task.dueDate ?? null, task.completedAt ?? Date.now(), JSON.stringify(task)],
      );
    }

    for (const entry of safeJsonParse<JournalEntry[]>(journalRaw || "[]", [])) {
      await db.execute(
        `INSERT OR REPLACE INTO domain_journal(id, entry_date, is_daily, updated_at, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.id, entry.date, entry.isDaily ? 1 : 0, entry.updatedAt ?? entry.createdAt ?? Date.now(), JSON.stringify(entry)],
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

    await db.execute("INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)", [SCHEMA_VERSION, Date.now()]);
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function initializeDomainDatabase(): Promise<void> {
  const db = await getDomainDatabase();
  if (!db) return;
  await createSchema(db);
  await migrateLegacyData(db);
}

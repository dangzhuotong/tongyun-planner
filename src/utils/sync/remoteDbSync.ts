import type Database from "@tauri-apps/plugin-sql";
import { getDomainDatabase, queueDomainWrite } from "../../data/domainDatabase";
import { safeJsonParse } from "../json";
import {
  prepareConfigForUpload,
  importDecryptedSecrets,
  collectSecretFields,
  isSecretsEmpty,
} from "./secretSync";
import { readSyncSecretsPassphrase, isSyncSecretsOptIn } from "./syncSecretsPref";
import { SYNC_APPLIED_EVENT } from "./types";

export const REMOTE_DSN_STORAGE_KEY = "tongyun_remote_dsn";
export const LAST_REMOTE_SYNC_TIME_KEY = "tongyun_last_remote_sync_time";

export const SYNC_TABLES_WHITELIST = [
  "tasks",
  "journal_entries",
  "pomodoro_logs",
  "habits",
  "agents",
  "task_dispatch",
  "sticky_notes",
  "countdowns",
  "timeblocks",
  "user_prefs",
  "sync_state",
  "sync_outbox",
] as const;

export type SyncTableName = (typeof SYNC_TABLES_WHITELIST)[number];

let remoteDbOverrideForTesting: Database | null = null;

export function setRemoteDatabaseOverrideForTesting(db: Database | null): void {
  remoteDbOverrideForTesting = db;
}

export function getRemoteDsn(): string | null {
  if (typeof localStorage !== "undefined") {
    const val = localStorage.getItem(REMOTE_DSN_STORAGE_KEY);
    if (val && val.trim()) return val.trim();
  }
  const proc = (globalThis as any).process;
  if (proc && proc.env?.TONGYUN_REMOTE_DSN) {
    return proc.env.TONGYUN_REMOTE_DSN.trim();
  }
  return null;
}

export function setRemoteDsn(dsn: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (!dsn || !dsn.trim()) {
    localStorage.removeItem(REMOTE_DSN_STORAGE_KEY);
  } else {
    localStorage.setItem(REMOTE_DSN_STORAGE_KEY, dsn.trim());
  }
}

export function isRemoteDsnConfigured(): boolean {
  if (remoteDbOverrideForTesting) return true;
  return Boolean(getRemoteDsn());
}

/**
 * 为不同 SQL 方言规范化语句占位符。
 * MySQL / TiDB 协议使用 '?' 占位符，如果发送 PostgreSQL 风格的 '$1', '$2' 会被 MySQL 当作未知字段列报错。
 * SQLite 同时兼容 '?' 与 '$1'。
 */
export function normalizeSqlForDialect(sql: string, dsn?: string | null): string {
  if (!dsn) return sql;
  const isMySql =
    dsn.startsWith("mysql:") ||
    dsn.startsWith("mysql://") ||
    dsn.startsWith("mariadb:") ||
    dsn.startsWith("mariadb://");
  if (isMySql) {
    return sql.replace(/\$\d+/g, "?");
  }
  return sql;
}

export function wrapDatabaseForDialect(db: Database, dsn?: string | null): Database {
  if (!db || !dsn) return db;
  const isMySql =
    dsn.startsWith("mysql:") ||
    dsn.startsWith("mysql://") ||
    dsn.startsWith("mariadb:") ||
    dsn.startsWith("mariadb://");
  if (!isMySql) return db;

  return {
    ...db,
    async execute(query: string, bindValues?: unknown[]) {
      const normalized = normalizeSqlForDialect(query, dsn);
      return db.execute(normalized, bindValues);
    },
    async select<T>(query: string, bindValues?: unknown[]) {
      const normalized = normalizeSqlForDialect(query, dsn);
      return db.select<T>(normalized, bindValues);
    },
    async close() {
      return db.close();
    },
  } as Database;
}

export async function loadRemoteDatabase(dsn?: string): Promise<Database | null> {
  const targetDsn = dsn || getRemoteDsn();
  if (remoteDbOverrideForTesting) {
    return wrapDatabaseForDialect(remoteDbOverrideForTesting, targetDsn);
  }
  if (!targetDsn) return null;

  try {
    const { default: DatabaseClass } = await import("@tauri-apps/plugin-sql");
    const rawDb = await DatabaseClass.load(targetDsn);
    return wrapDatabaseForDialect(rawDb, targetDsn);
  } catch (error) {
    console.warn("[remoteDbSync] Failed to load remote database:", error);
    return null;
  }
}

export let lastRemoteDsnError: string | null = null;

export async function testRemoteDsn(dsn?: string): Promise<boolean> {
  lastRemoteDsnError = null;
  try {
    const db = await loadRemoteDatabase(dsn);
    if (!db) {
      lastRemoteDsnError = "无法加载数据库驱动或未配置 DSN";
      return false;
    }
    await db.select("SELECT 1");
    return true;
  } catch (err: any) {
    console.warn("[remoteDbSync] Remote connection test failed:", err);
    lastRemoteDsnError = err?.message || String(err);
    // 尝试重连一次（应对闲置断连）
    try {
      const db = await loadRemoteDatabase(dsn);
      if (db) {
        await db.select("SELECT 1");
        lastRemoteDsnError = null;
        return true;
      }
    } catch {
      // 保留原始错误
    }
    return false;
  }
}

export interface SyncStats {
  pushed: number;
  pulled: number;
  tables: Record<string, { pushed: number; pulled: number }>;
}

/**
 * 校验机密安全性：
 * 若配置了敏感凭据但未配置 passphrase，严禁上传明文！
 */
export function isPlaintextSecretsRefusal(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text.includes("机密无口令拒明文");
}

export function assertSecretsSafeForSync(prefsJsonObj: any): void {
  const secrets = collectSecretFields(prefsJsonObj);
  if (!isSecretsEmpty(secrets)) {
    const passphrase = readSyncSecretsPassphrase();
    const optIn = isSyncSecretsOptIn(prefsJsonObj);
    if (optIn && !passphrase) {
      throw new Error("机密无口令拒明文：未设置同步主密码，禁止上传敏感凭据");
    }
  }
}

/**
 * 执行 Full-Schema 远端双向同步（推远端 + 拉回本地）。
 * 遵循验收标准：
 * 1) 无 DSN 仅本机 SQLite（直接跳过，零网络副作用）
 * 2) 配 DSN 后 full-schema 12 张业务表推远端并可拉回；断网可写上线追平
 * 3) 机密无口令拒明文
 */
export async function syncFullSchemaWithRemote(options?: {
  dsn?: string;
  dbOverride?: Database | null;
  forcePush?: boolean;
}): Promise<SyncStats> {
  const stats: SyncStats = {
    pushed: 0,
    pulled: 0,
    tables: {},
  };
  for (const table of SYNC_TABLES_WHITELIST) {
    stats.tables[table] = { pushed: 0, pulled: 0 };
  }

  const targetDsn = options?.dsn || getRemoteDsn();
  const remoteOverride = options?.dbOverride || remoteDbOverrideForTesting;

  // 1. 无 DSN 仅本机 SQLite
  if (!targetDsn && !remoteOverride) {
    return stats;
  }

  // 2. 检测网络状态（断网本机可写，上线追平）
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const err = new Error("网络已断开（离线模式），本地写入正常，上线后将自动追平");
    (err as any).isOffline = true;
    throw err;
  }

  const localDb = await getDomainDatabase();
  if (!localDb) {
    return stats;
  }

  const remoteDb = remoteOverride || (await loadRemoteDatabase(targetDsn!));
  if (!remoteDb) {
    throw new Error("无法连接到远端数据库，检查 DSN 或网络状态");
  }

  const lastSyncAt = parseInt(
    (typeof localStorage !== "undefined" && localStorage.getItem(LAST_REMOTE_SYNC_TIME_KEY)) || "0",
    10,
  );
  const now = Date.now();

  // ==========================================
  // PUSH: 本地 full-schema -> 远端数据库
  // ==========================================

  // 1. tasks
  try {
    const localTasks = await localDb
      .select<any[]>("SELECT * FROM tasks WHERE updated_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM tasks"));

    let taskPushed = 0;
    for (const t of localTasks || []) {
      const payloadObj = {
        subtasks: safeJsonParse(t.subtasks_json, []),
        tags: safeJsonParse(t.tags_json, []),
        dependsOn: safeJsonParse(t.depends_on_json, []),
        attachments: safeJsonParse(t.attachments_json, []),
        data: t.data,
      };

      await remoteDb.execute(
        `INSERT INTO tasks (
          id, title, description, notes, category, due_date, due_time,
          is_favorite, is_pinned, repeat_rule, repeat_anchor_day, priority,
          energy_level, estimated_pomodoros, journal_id, completed_at,
          assignee_kind, assignee_agent_id, run_status, stamp,
          time_block_start, time_block_end, payload_json, device_id,
          updated_at, deleted_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        ) ON DUPLICATE KEY UPDATE
          title=VALUES(title), description=VALUES(description), notes=VALUES(notes),
          category=VALUES(category), due_date=VALUES(due_date), due_time=VALUES(due_time),
          is_favorite=VALUES(is_favorite), is_pinned=VALUES(is_pinned),
          repeat_rule=VALUES(repeat_rule), repeat_anchor_day=VALUES(repeat_anchor_day),
          priority=VALUES(priority), energy_level=VALUES(energy_level),
          estimated_pomodoros=VALUES(estimated_pomodoros), journal_id=VALUES(journal_id),
          completed_at=VALUES(completed_at), assignee_kind=VALUES(assignee_kind),
          assignee_agent_id=VALUES(assignee_agent_id), run_status=VALUES(run_status),
          stamp=VALUES(stamp), time_block_start=VALUES(time_block_start),
          time_block_end=VALUES(time_block_end), payload_json=VALUES(payload_json),
          device_id=VALUES(device_id), updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at)`,
        [
          t.id,
          t.title,
          t.description ?? null,
          t.notes ?? null,
          t.category ?? null,
          t.due_date ?? null,
          t.due_time ?? null,
          t.is_favorite ? 1 : 0,
          t.is_pinned ? 1 : 0,
          t.repeat_rule ?? null,
          t.repeat_anchor_day ?? null,
          t.priority ?? null,
          t.energy_level ?? null,
          t.estimated_pomodoros ?? null,
          t.journal_id ?? null,
          t.completed_at ?? null,
          t.assignee_kind || "human",
          t.assignee_agent_id ?? null,
          t.run_status ?? null,
          t.stamp ?? null,
          t.time_block_start ?? null,
          t.time_block_end ?? null,
          JSON.stringify(payloadObj),
          "local",
          t.updated_at || now,
          t.deleted_at ?? null,
        ],
      );
      taskPushed++;
    }
    stats.tables.tasks = { pushed: taskPushed, pulled: 0 };
    stats.pushed += taskPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push tasks error:", err);
  }

  // 2. journal_entries
  try {
    const localJournals = await localDb
      .select<any[]>("SELECT * FROM journal_entries WHERE updated_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM journal_entries"));

    let jPushed = 0;
    for (const j of localJournals || []) {
      const metaObj = {
        original_id: j.id,
        attachments: safeJsonParse(j.attachments_json, []),
        data: j.data,
      };

      const dayStr = j.entry_date || new Date(j.created_at || now).toISOString().split("T")[0];
      const isNumId = /^\d+$/.test(String(j.id));
      const remoteId = isNumId ? BigInt(j.id) : null;

      if (remoteId) {
        await remoteDb.execute(
          `INSERT INTO journal_entries (
            id, day, title, body, meta_json, link_key, entry_date, is_daily,
            mood, ai_comment, template_id, washi_tape, stamp, stickers_json,
            created_at, updated_at, deleted_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            FROM_UNIXTIME($16 / 1000), ${j.deleted_at ? `FROM_UNIXTIME(${j.deleted_at} / 1000)` : "NULL"}
          ) ON DUPLICATE KEY UPDATE
            day=VALUES(day), title=VALUES(title), body=VALUES(body), meta_json=VALUES(meta_json),
            link_key=VALUES(link_key), entry_date=VALUES(entry_date), is_daily=VALUES(is_daily),
            mood=VALUES(mood), ai_comment=VALUES(ai_comment), template_id=VALUES(template_id),
            washi_tape=VALUES(washi_tape), stamp=VALUES(stamp), stickers_json=VALUES(stickers_json),
            created_at=VALUES(created_at), updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at)`,
          [
            remoteId,
            dayStr,
            j.title || "",
            j.body || "",
            JSON.stringify(metaObj),
            j.link_key ?? null,
            j.entry_date ?? null,
            j.is_daily ?? 1,
            j.mood ?? null,
            j.ai_comment ?? null,
            j.template_id ?? null,
            j.washi_tape ?? null,
            j.stamp ?? null,
            j.stickers_json ?? null,
            j.created_at || now,
            j.updated_at || now,
          ],
        );
      } else {
        await remoteDb.execute(
          `INSERT INTO journal_entries (
            day, title, body, meta_json, link_key, entry_date, is_daily,
            mood, ai_comment, template_id, washi_tape, stamp, stickers_json,
            created_at, updated_at, deleted_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, FROM_UNIXTIME($15 / 1000), ${j.deleted_at ? `FROM_UNIXTIME(${j.deleted_at} / 1000)` : "NULL"}
          )`,
          [
            dayStr,
            j.title || "",
            j.body || "",
            JSON.stringify(metaObj),
            j.link_key ?? null,
            j.entry_date ?? null,
            j.is_daily ?? 1,
            j.mood ?? null,
            j.ai_comment ?? null,
            j.template_id ?? null,
            j.washi_tape ?? null,
            j.stamp ?? null,
            j.stickers_json ?? null,
            j.created_at || now,
            j.updated_at || now,
          ],
        );
      }
      jPushed++;
    }
    stats.tables.journal_entries = { pushed: jPushed, pulled: 0 };
    stats.pushed += jPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push journal_entries error:", err);
  }

  // 3. pomodoro_logs
  try {
    const localLogs = await localDb
      .select<any[]>("SELECT * FROM pomodoro_logs WHERE created_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM pomodoro_logs"));

    let pomoPushed = 0;
    for (const p of localLogs || []) {
      await remoteDb.execute(
        `INSERT INTO pomodoro_logs (
          id, occurred_at, duration_sec, task_id, task_title, meta_json
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON DUPLICATE KEY UPDATE
          occurred_at=VALUES(occurred_at), duration_sec=VALUES(duration_sec),
          task_id=VALUES(task_id), task_title=VALUES(task_title), meta_json=VALUES(meta_json)`,
        [
          p.id,
          p.timestamp || p.occurred_at || now,
          p.duration ? p.duration * 60 : 1500,
          p.task_id ?? null,
          p.task_title ?? null,
          p.data ?? null,
        ],
      );
      pomoPushed++;
    }
    stats.tables.pomodoro_logs = { pushed: pomoPushed, pulled: 0 };
    stats.pushed += pomoPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push pomodoro_logs error:", err);
  }

  // 4. habits
  try {
    const localHabits = await localDb
      .select<any[]>("SELECT * FROM habits WHERE updated_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM habits"));

    let habitPushed = 0;
    for (const h of localHabits || []) {
      const meta = {
        done_today: h.done_today,
        streak: h.streak,
        last_done_date: h.last_done_date,
        data: h.data,
      };
      await remoteDb.execute(
        `INSERT INTO habits (id, name, emoji, meta_json, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name), emoji=VALUES(emoji), meta_json=VALUES(meta_json),
           updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at)`,
        [
          h.id,
          h.name,
          h.emoji || "✨",
          JSON.stringify(meta),
          h.updated_at || now,
          h.deleted_at ?? null,
        ],
      );
      habitPushed++;
    }
    stats.tables.habits = { pushed: habitPushed, pulled: 0 };
    stats.pushed += habitPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push habits error:", err);
  }

  // 5. agents
  try {
    const localAgents = await localDb.select<any[]>("SELECT * FROM agents");
    let agentPushed = 0;
    for (const a of localAgents || []) {
      await remoteDb.execute(
        `INSERT INTO agents (handle, kind, enabled, meta_json)
         VALUES ($1, $2, $3, $4)
         ON DUPLICATE KEY UPDATE
           kind=VALUES(kind), enabled=VALUES(enabled), meta_json=VALUES(meta_json)`,
        [a.handle, a.kind, a.enabled ? 1 : 0, a.meta ?? "{}"],
      );
      agentPushed++;
    }
    stats.tables.agents = { pushed: agentPushed, pulled: 0 };
    stats.pushed += agentPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push agents error:", err);
  }

  // 6. task_dispatch
  try {
    const localDispatches = await localDb
      .select<any[]>("SELECT * FROM task_dispatch WHERE updated_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM task_dispatch"));

    let dispatchPushed = 0;
    for (const d of localDispatches || []) {
      await remoteDb.execute(
        `INSERT INTO task_dispatch (planner_task_id, agent_id, status, pipeline_task_id, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          d.task_id,
          /^\d+$/.test(String(d.agent_id)) ? BigInt(d.agent_id) : 1n,
          d.status,
          d.pipeline_task_id && /^\d+$/.test(d.pipeline_task_id)
            ? BigInt(d.pipeline_task_id)
            : null,
          d.note ?? null,
        ],
      );
      dispatchPushed++;
    }
    stats.tables.task_dispatch = { pushed: dispatchPushed, pulled: 0 };
    stats.pushed += dispatchPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push task_dispatch error:", err);
  }

  // 7. sticky_notes
  try {
    const localNotes = await localDb
      .select<any[]>("SELECT * FROM sticky_notes WHERE updated_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM sticky_notes"));

    let notesPushed = 0;
    for (const n of localNotes || []) {
      await remoteDb.execute(
        `INSERT INTO sticky_notes (id, title, body, color, rotate, meta_json, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON DUPLICATE KEY UPDATE
           title=VALUES(title), body=VALUES(body), color=VALUES(color), rotate=VALUES(rotate),
           meta_json=VALUES(meta_json), updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at)`,
        [
          n.id,
          n.title ?? null,
          n.text,
          n.color,
          n.rotate || 0,
          n.data ?? null,
          n.updated_at || now,
          n.deleted_at ?? null,
        ],
      );
      notesPushed++;
    }
    stats.tables.sticky_notes = { pushed: notesPushed, pulled: 0 };
    stats.pushed += notesPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push sticky_notes error:", err);
  }

  // 8. countdowns
  try {
    const localCountdowns = await localDb
      .select<any[]>("SELECT * FROM countdowns WHERE updated_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM countdowns"));

    let cdPushed = 0;
    for (const c of localCountdowns || []) {
      await remoteDb.execute(
        `INSERT INTO countdowns (id, title, target_date, emoji, color, is_lunar, meta_json, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON DUPLICATE KEY UPDATE
           title=VALUES(title), target_date=VALUES(target_date), emoji=VALUES(emoji),
           color=VALUES(color), is_lunar=VALUES(is_lunar), meta_json=VALUES(meta_json),
           updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at)`,
        [
          c.id,
          c.title,
          c.target_date,
          c.emoji ?? null,
          c.color ?? null,
          c.is_lunar ? 1 : 0,
          c.data ?? null,
          c.updated_at || now,
          c.deleted_at ?? null,
        ],
      );
      cdPushed++;
    }
    stats.tables.countdowns = { pushed: cdPushed, pulled: 0 };
    stats.pushed += cdPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push countdowns error:", err);
  }

  // 9. timeblocks
  try {
    const localBlocks = await localDb
      .select<any[]>("SELECT * FROM timeblocks WHERE updated_at > $1", [lastSyncAt])
      .catch(async () => localDb.select<any[]>("SELECT * FROM timeblocks"));

    let tbPushed = 0;
    for (const b of localBlocks || []) {
      await remoteDb.execute(
        `INSERT INTO timeblocks (id, day, start_time, end_time, task_id, title, color, meta_json, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON DUPLICATE KEY UPDATE
           day=VALUES(day), start_time=VALUES(start_time), end_time=VALUES(end_time),
           task_id=VALUES(task_id), title=VALUES(title), color=VALUES(color),
           meta_json=VALUES(meta_json), updated_at=VALUES(updated_at), deleted_at=VALUES(deleted_at)`,
        [
          b.id,
          b.date,
          b.start_time,
          b.end_time,
          b.task_id ?? null,
          b.title,
          b.color,
          b.data ?? null,
          b.updated_at || now,
          b.deleted_at ?? null,
        ],
      );
      tbPushed++;
    }
    stats.tables.timeblocks = { pushed: tbPushed, pulled: 0 };
    stats.pushed += tbPushed;
  } catch (err) {
    console.warn("[remoteDbSync] Push timeblocks error:", err);
  }

  // 10. user_prefs (严格执行：机密无口令拒明文)
  try {
    const localPrefs = await localDb.select<any[]>("SELECT * FROM user_prefs WHERE id = 1");
    if (localPrefs && localPrefs.length > 0) {
      const p = localPrefs[0];
      const parsedCustomization = safeJsonParse(p.customization_json, {});

      // 安全断言：机密无口令拒明文
      assertSecretsSafeForSync(parsedCustomization);

      // 加密或清理机密
      const safeConfig = await prepareConfigForUpload(parsedCustomization as any);

      const prefsMeta = {
        theme_mode: p.theme_mode,
        customization_json: JSON.stringify(safeConfig),
        pomodoro_focus_duration: p.pomodoro_focus_duration,
        pomodoro_break_duration: p.pomodoro_break_duration,
        alert_sound_type: p.alert_sound_type,
        sidebar_collapsed: p.sidebar_collapsed,
        random_break: p.random_break,
        auto_noise: p.auto_noise,
        daily_goal: p.daily_goal,
        due_remind_enabled: p.due_remind_enabled,
        due_remind_before_min: p.due_remind_before_min,
      };

      await remoteDb.execute(
        `INSERT INTO user_prefs (id, locale, nickname, pomodoro_minutes, prefs_json, updated_at)
         VALUES (1, $1, $2, $3, $4, $5)
         ON DUPLICATE KEY UPDATE
           locale=VALUES(locale), nickname=VALUES(nickname), pomodoro_minutes=VALUES(pomodoro_minutes),
           prefs_json=VALUES(prefs_json), updated_at=VALUES(updated_at)`,
        [
          p.locale || "zh-CN",
          p.nickname ?? null,
          p.pomodoro_focus_duration || 25,
          JSON.stringify(prefsMeta),
          p.updated_at || now,
        ],
      );
      stats.tables.user_prefs = { pushed: 1, pulled: 0 };
      stats.pushed += 1;
    }
  } catch (err) {
    console.warn("[remoteDbSync] Push user_prefs error:", err);
    // 只有「机密无口令拒明文」打断整次同步。单表失败（缺列、权限）记下来，不把侧栏打红。
    if (isPlaintextSecretsRefusal(err)) throw err;
  }

  // 11. sync_state
  try {
    await remoteDb.execute(
      `INSERT INTO sync_state (entity, version, last_sync_at, backend, meta_json, updated_at)
       VALUES ('all', $1, $2, 'remote-dsn', '{}', $3)
       ON DUPLICATE KEY UPDATE
         version=VALUES(version), last_sync_at=VALUES(last_sync_at),
         backend=VALUES(backend), updated_at=VALUES(updated_at)`,
      [now, now, now],
    );
    stats.tables.sync_state = { pushed: 1, pulled: 0 };
    stats.pushed += 1;
  } catch (err) {
    console.warn("[remoteDbSync] Push sync_state error:", err);
  }

  // 12. sync_outbox (清空已同步出件箱)
  try {
    const outboxRows = await localDb
      .select<any[]>("SELECT id FROM sync_outbox WHERE created_at <= $1", [now])
      .catch(() => []);
    if (outboxRows.length > 0) {
      await localDb.execute("DELETE FROM sync_outbox WHERE created_at <= $1", [now]);
    }
    stats.tables.sync_outbox = { pushed: outboxRows.length, pulled: 0 };
    stats.pushed += outboxRows.length;
  } catch (err) {
    console.warn("[remoteDbSync] Push sync_outbox error:", err);
  }

  // ==========================================
  // PULL: 远端数据库 -> 本地 SQLite
  // ==========================================

  // 1. Pull tasks (数据库优先：全量拉取远端未遗漏的所有待办并同步本地)
  try {
    const remoteTasks = await remoteDb
      .select<any[]>("SELECT * FROM tasks")
      .catch(async () => []);

    let taskPulled = 0;
    if (remoteTasks && remoteTasks.length > 0) {
      await queueDomainWrite(async (db) => {
        await db.execute("BEGIN IMMEDIATE");
        try {
          for (const rt of remoteTasks) {
            const payload = safeJsonParse<any>(rt.payload_json, {});
            await db.execute(
              `INSERT OR REPLACE INTO tasks (
                id, title, description, notes, category, due_date, due_time,
                is_favorite, is_pinned, repeat_rule, repeat_anchor_day, priority,
                energy_level, estimated_pomodoros, journal_id, completed_at,
                assignee_kind, assignee_agent_id, run_status, stamp,
                time_block_start, time_block_end, subtasks_json, tags_json,
                depends_on_json, attachments_json, data, updated_at, deleted_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
                $27, $28, $29
              )`,
              [
                rt.id,
                rt.title,
                rt.description ?? null,
                rt.notes ?? null,
                rt.category || "urgent-important",
                rt.due_date ?? null,
                rt.due_time ?? null,
                rt.is_favorite ? 1 : 0,
                rt.is_pinned ? 1 : 0,
                rt.repeat_rule ?? null,
                rt.repeat_anchor_day ?? null,
                rt.priority || "medium",
                rt.energy_level ?? null,
                rt.estimated_pomodoros ?? null,
                rt.journal_id ?? null,
                rt.completed_at ?? null,
                rt.assignee_kind || "human",
                rt.assignee_agent_id ?? null,
                rt.run_status ?? null,
                rt.stamp ?? null,
                rt.time_block_start ?? null,
                rt.time_block_end ?? null,
                JSON.stringify(payload.subtasks || []),
                JSON.stringify(payload.tags || []),
                JSON.stringify(payload.dependsOn || []),
                JSON.stringify(payload.attachments || []),
                payload.data || null,
                rt.updated_at,
                rt.deleted_at ?? null,
              ],
            );
            // 同步维护 domain_tasks 保持三源兼容
            await db
              .execute(
                `INSERT OR REPLACE INTO domain_tasks (
                  id, completed_at, due_date, updated_at, data, assignee_kind, assignee_agent_id, run_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  rt.id,
                  rt.completed_at ?? null,
                  rt.due_date ?? null,
                  rt.updated_at || now,
                  JSON.stringify(payload.data || {
                    id: rt.id,
                    title: rt.title,
                    description: rt.description,
                    category: rt.category,
                    dueDate: rt.due_date,
                    dueTime: rt.due_time,
                    priority: rt.priority,
                    completedAt: rt.completed_at,
                  }),
                  rt.assignee_kind || "human",
                  rt.assignee_agent_id ?? null,
                  rt.run_status ?? null,
                ],
              )
              .catch(() => undefined);
            taskPulled++;
          }
          await db.execute("COMMIT");
        } catch (e) {
          await db.execute("ROLLBACK").catch(() => undefined);
          throw e;
        }
      });
    }
    if (stats.tables.tasks) stats.tables.tasks.pulled = taskPulled;
    stats.pulled += taskPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull tasks error:", err);
  }

  // 2. Pull journal_entries
  try {
    const remoteJournals = await remoteDb
      .select<any[]>("SELECT * FROM journal_entries")
      .catch(() => []);

    let jPulled = 0;
    if (remoteJournals && remoteJournals.length > 0) {
      await queueDomainWrite(async (db) => {
        await db.execute("BEGIN IMMEDIATE");
        try {
          for (const rj of remoteJournals) {
            const meta = safeJsonParse<any>(rj.meta_json, {});
            const localId = meta.original_id || String(rj.id);
            const createdMs = rj.created_at || now;
            const updatedMs = rj.updated_at ? new Date(rj.updated_at).getTime() : now;
            const deletedMs = rj.deleted_at ? new Date(rj.deleted_at).getTime() : null;

            await db.execute(
              `INSERT OR REPLACE INTO journal_entries (
                id, link_key, title, body, entry_date, is_daily, mood,
                ai_comment, template_id, washi_tape, stamp, stickers_json,
                attachments_json, data, created_at, updated_at, deleted_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
              )`,
              [
                localId,
                rj.link_key || rj.day || "",
                rj.title || "",
                rj.body || "",
                rj.entry_date || rj.day || "",
                rj.is_daily != null ? rj.is_daily : 1,
                rj.mood ?? null,
                rj.ai_comment ?? null,
                rj.template_id ?? null,
                rj.washi_tape ?? null,
                rj.stamp ?? null,
                rj.stickers_json ? JSON.stringify(rj.stickers_json) : null,
                JSON.stringify(meta.attachments || []),
                meta.data || null,
                createdMs,
                updatedMs,
                deletedMs,
              ],
            );
            jPulled++;
          }
          await db.execute("COMMIT");
        } catch (e) {
          await db.execute("ROLLBACK").catch(() => undefined);
          throw e;
        }
      });
    }
    if (stats.tables.journal_entries) stats.tables.journal_entries.pulled = jPulled;
    stats.pulled += jPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull journal error:", err);
  }

  // 3. Pull pomodoro_logs
  try {
    const remoteLogs = await remoteDb.select<any[]>("SELECT * FROM pomodoro_logs").catch(() => []);
    let pomoPulled = 0;
    if (remoteLogs && remoteLogs.length > 0) {
      await queueDomainWrite(async (db) => {
        for (const rp of remoteLogs) {
          const durationMin = rp.duration_sec
            ? Math.round(rp.duration_sec / 60)
            : rp.duration || 25;
          const timestampMs = rp.occurred_at || rp.timestamp || now;
          await db.execute(
            `INSERT OR REPLACE INTO pomodoro_logs (
              id, timestamp, duration, task_id, task_title, created_at, deleted_at, data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              rp.id,
              timestampMs,
              durationMin,
              rp.task_id ?? null,
              rp.task_title ?? null,
              rp.created_at || timestampMs,
              rp.deleted_at ?? null,
              rp.meta_json || rp.data || null,
            ],
          );
          pomoPulled++;
        }
      });
    }
    stats.tables.pomodoro_logs.pulled = pomoPulled;
    stats.pulled += pomoPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull pomodoro_logs error:", err);
  }

  // 4. Pull habits
  try {
    const remoteHabits = await remoteDb.select<any[]>("SELECT * FROM habits").catch(() => []);
    let habitPulled = 0;
    if (remoteHabits && remoteHabits.length > 0) {
      await queueDomainWrite(async (db) => {
        for (const rh of remoteHabits) {
          const meta = safeJsonParse<any>(rh.meta_json, {});
          await db.execute(
            `INSERT OR REPLACE INTO habits (id, name, emoji, done_today, streak, last_done_date, updated_at, deleted_at, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              rh.id,
              rh.name,
              rh.emoji,
              meta.done_today ? 1 : 0,
              meta.streak || 0,
              meta.last_done_date ?? null,
              rh.updated_at,
              rh.deleted_at ?? null,
              meta.data || null,
            ],
          );
          habitPulled++;
        }
      });
    }
    stats.tables.habits.pulled = habitPulled;
    stats.pulled += habitPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull habits error:", err);
  }

  // 5. Pull agents
  try {
    const remoteAgents = await remoteDb.select<any[]>("SELECT * FROM agents").catch(() => []);
    let agentPulled = 0;
    if (remoteAgents && remoteAgents.length > 0) {
      await queueDomainWrite(async (db) => {
        for (const ra of remoteAgents) {
          const agentId = ra.id ? String(ra.id) : `agent_${ra.handle}`;
          await db.execute(
            `INSERT OR REPLACE INTO agents (id, handle, kind, enabled, meta, updated_at, deleted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              agentId,
              ra.handle,
              ra.kind || "manual",
              ra.enabled != null ? (ra.enabled ? 1 : 0) : 1,
              ra.meta_json || ra.meta || "{}",
              ra.updated_at || now,
              ra.deleted_at ?? null,
            ],
          );
          agentPulled++;
        }
      });
    }
    stats.tables.agents.pulled = agentPulled;
    stats.pulled += agentPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull agents error:", err);
  }

  // 6. Pull task_dispatch
  try {
    const remoteDispatches = await remoteDb
      .select<any[]>("SELECT * FROM task_dispatch")
      .catch(() => []);
    let dispatchPulled = 0;
    if (remoteDispatches && remoteDispatches.length > 0) {
      await queueDomainWrite(async (db) => {
        for (const rd of remoteDispatches) {
          const dispatchId = rd.id
            ? String(rd.id)
            : `dispatch_${rd.planner_task_id || rd.task_id}_${rd.agent_id}`;
          const taskId = rd.planner_task_id || rd.task_id;
          await db.execute(
            `INSERT OR REPLACE INTO task_dispatch (id, task_id, agent_id, status, note, pipeline_task_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              dispatchId,
              taskId,
              String(rd.agent_id),
              rd.status || "pending",
              rd.note ?? null,
              rd.pipeline_task_id ? String(rd.pipeline_task_id) : null,
              rd.created_at || now,
              rd.updated_at || now,
            ],
          );
          dispatchPulled++;
        }
      });
    }
    stats.tables.task_dispatch.pulled = dispatchPulled;
    stats.pulled += dispatchPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull task_dispatch error:", err);
  }

  // 7. Pull sticky_notes
  try {
    const remoteNotes = await remoteDb.select<any[]>("SELECT * FROM sticky_notes").catch(() => []);
    let notesPulled = 0;
    if (remoteNotes && remoteNotes.length > 0) {
      await queueDomainWrite(async (db) => {
        for (const rn of remoteNotes) {
          await db.execute(
            `INSERT OR REPLACE INTO sticky_notes (id, title, text, color, rotate, updated_at, deleted_at, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              rn.id,
              rn.title ?? null,
              rn.body,
              rn.color,
              rn.rotate || 0,
              rn.updated_at,
              rn.deleted_at ?? null,
              rn.meta_json ? JSON.stringify(rn.meta_json) : null,
            ],
          );
          notesPulled++;
        }
      });
    }
    stats.tables.sticky_notes.pulled = notesPulled;
    stats.pulled += notesPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull sticky_notes error:", err);
  }

  // 8. Pull countdowns
  try {
    const remoteCountdowns = await remoteDb
      .select<any[]>("SELECT * FROM countdowns")
      .catch(() => []);
    let cdPulled = 0;
    if (remoteCountdowns && remoteCountdowns.length > 0) {
      await queueDomainWrite(async (db) => {
        for (const rc of remoteCountdowns) {
          await db.execute(
            `INSERT OR REPLACE INTO countdowns (id, title, target_date, emoji, color, is_lunar, updated_at, deleted_at, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              rc.id,
              rc.title,
              rc.target_date,
              rc.emoji ?? null,
              rc.color ?? null,
              rc.is_lunar ? 1 : 0,
              rc.updated_at,
              rc.deleted_at ?? null,
              rc.meta_json ? JSON.stringify(rc.meta_json) : null,
            ],
          );
          cdPulled++;
        }
      });
    }
    stats.tables.countdowns.pulled = cdPulled;
    stats.pulled += cdPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull countdowns error:", err);
  }

  // 9. Pull timeblocks
  try {
    const remoteBlocks = await remoteDb.select<any[]>("SELECT * FROM timeblocks").catch(() => []);
    let tbPulled = 0;
    if (remoteBlocks && remoteBlocks.length > 0) {
      await queueDomainWrite(async (db) => {
        for (const rb of remoteBlocks) {
          await db.execute(
            `INSERT OR REPLACE INTO timeblocks (id, date, start_time, end_time, task_id, title, color, updated_at, deleted_at, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              rb.id,
              rb.day,
              rb.start_time,
              rb.end_time,
              rb.task_id ?? null,
              rb.title,
              rb.color,
              rb.updated_at,
              rb.deleted_at ?? null,
              rb.meta_json ? JSON.stringify(rb.meta_json) : null,
            ],
          );
          tbPulled++;
        }
      });
    }
    stats.tables.timeblocks.pulled = tbPulled;
    stats.pulled += tbPulled;
  } catch (err) {
    console.warn("[remoteDbSync] Pull timeblocks error:", err);
  }

  // 10. Pull user_prefs & 解密机密
  try {
    const remotePrefs = await remoteDb
      .select<any[]>("SELECT * FROM user_prefs WHERE id = 1")
      .catch(() => []);
    if (remotePrefs && remotePrefs.length > 0) {
      const rp = remotePrefs[0];
      const meta = safeJsonParse<any>(rp.prefs_json, {});
      const remoteConfig = safeJsonParse<any>(meta.customization_json, {});

      // 本地现有配置
      const localPrefs = await localDb.select<any[]>("SELECT * FROM user_prefs WHERE id = 1");
      const localCustom =
        localPrefs.length > 0 ? safeJsonParse<any>(localPrefs[0].customization_json, {}) : {};

      // 导入解密机密
      if (remoteConfig.encryptedSecrets) {
        await importDecryptedSecrets(remoteConfig, localCustom);
      }

      await queueDomainWrite(async (db) => {
        await db.execute(
          `INSERT OR REPLACE INTO user_prefs (
            id, locale, nickname, theme_mode, customization_json,
            pomodoro_focus_duration, pomodoro_break_duration, alert_sound_type,
            sidebar_collapsed, random_break, auto_noise, daily_goal,
            due_remind_enabled, due_remind_before_min, updated_at
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            rp.locale || "zh-CN",
            rp.nickname ?? null,
            meta.theme_mode || "auto",
            JSON.stringify(localCustom),
            rp.pomodoro_minutes || 25,
            meta.pomodoro_break_duration || 5,
            meta.alert_sound_type || "ding",
            meta.sidebar_collapsed || 0,
            meta.random_break || 0,
            meta.auto_noise || 0,
            meta.daily_goal ?? null,
            meta.due_remind_enabled != null ? meta.due_remind_enabled : 1,
            meta.due_remind_before_min || 15,
            rp.updated_at || now,
          ],
        );
      });
      stats.tables.user_prefs.pulled = 1;
      stats.pulled += 1;
    }
  } catch (err) {
    console.warn("[remoteDbSync] Pull user_prefs error:", err);
  }

  // 11. 更新本地 sync_state
  await localDb
    .execute(
      `INSERT OR REPLACE INTO sync_state (entity, version, updated_at, last_sync_at, backend)
     VALUES ('remote_dsn', $1, $2, $3, 'database')`,
      [now, now, now],
    )
    .catch(() => undefined);
  stats.tables.sync_state.pulled = 1;

  // 记录最后同步时间
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LAST_REMOTE_SYNC_TIME_KEY, String(now));
  }

  // 从本地 SQLite 查询拉取后的完整数据并刷新 localStorage 和 UI
  try {
    const taskRows = await localDb
      .select<any[]>("SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC")
      .catch(() => []);
    const pulledTasks: any[] = [];
    const pulledCompleted: any[] = [];
    for (const r of taskRows || []) {
      const payload = safeJsonParse<any>(r.payload_json, {});
      const item: any = {
        id: r.id,
        title: r.title,
        description: r.description ?? undefined,
        notes: r.notes ?? undefined,
        category: r.category || "urgent-important",
        dueDate: r.due_date ?? undefined,
        dueTime: r.due_time ?? undefined,
        isFavorite: Boolean(r.is_favorite),
        isPinned: Boolean(r.is_pinned),
        repeat: r.repeat_rule ?? undefined,
        repeatAnchorDay: r.repeat_anchor_day ?? undefined,
        priority: r.priority || "medium",
        energyLevel: r.energy_level ?? undefined,
        estimatedPomodoros: r.estimated_pomodoros ?? undefined,
        journalId: r.journal_id ?? undefined,
        completedAt: r.completed_at ?? undefined,
        assigneeKind: r.assignee_kind || "human",
        assigneeAgentId: r.assignee_agent_id ?? undefined,
        runStatus: r.run_status ?? undefined,
        stamp: r.stamp ?? undefined,
        timeBlockStart: r.time_block_start ?? undefined,
        timeBlockEnd: r.time_block_end ?? undefined,
        subtasks: payload.subtasks || [],
        tags: payload.tags || [],
        dependsOn: payload.dependsOn || [],
        attachments: payload.attachments || [],
        data: payload.data || undefined,
        updatedAt: r.updated_at,
        deletedAt: r.deleted_at ?? undefined,
      };
      if (r.completed_at) {
        pulledCompleted.push(item);
      } else {
        pulledTasks.push(item);
      }
    }

    const noteRows = await localDb
      .select<any[]>("SELECT * FROM sticky_notes WHERE deleted_at IS NULL ORDER BY updated_at DESC")
      .catch(() => []);
    const pulledNotes = (noteRows || []).map((n) => ({
      id: n.id,
      title: n.title ?? undefined,
      text: n.body || n.text || "",
      color: n.color,
      rotate: n.rotate || 0,
      updatedAt: n.updated_at,
      data: n.data ?? undefined,
    }));

    const pomoRows = await localDb
      .select<any[]>("SELECT * FROM pomodoro_logs WHERE deleted_at IS NULL ORDER BY timestamp DESC")
      .catch(() => []);
    const pulledPomodoro = (pomoRows || []).map((p) => ({
      id: p.id,
      timestamp: p.timestamp || p.occurred_at || now,
      duration: p.duration || (p.duration_sec ? Math.round(p.duration_sec / 60) : 25),
      taskId: p.task_id ?? undefined,
      taskTitle: p.task_title ?? undefined,
      createdAt: p.created_at || p.timestamp || now,
      data: p.data ?? undefined,
    }));

    const countdownRows = await localDb
      .select<any[]>("SELECT * FROM countdowns WHERE deleted_at IS NULL ORDER BY target_date ASC")
      .catch(() => []);
    const pulledCountdowns = (countdownRows || []).map((c) => ({
      id: c.id,
      title: c.title,
      targetDate: c.target_date,
      emoji: c.emoji ?? undefined,
      color: c.color ?? undefined,
      isLunar: Boolean(c.is_lunar),
      updatedAt: c.updated_at,
      data: c.data ?? undefined,
    }));

    const journalRows = await localDb
      .select<any[]>("SELECT * FROM journal_entries WHERE deleted_at IS NULL ORDER BY updated_at DESC")
      .catch(() => []);
    const pulledJournal = (journalRows || []).map((j) => {
      const meta = safeJsonParse<any>(j.meta_json, {});
      return {
        id: meta.original_id || String(j.id),
        date: j.entry_date || j.day || "",
        linkKey: j.link_key || j.day || "",
        title: j.title || "",
        content: j.body || "",
        isDaily: j.is_daily != null ? Boolean(j.is_daily) : true,
        mood: j.mood ?? undefined,
        aiComment: j.ai_comment ?? undefined,
        templateId: j.template_id ?? undefined,
        washiTape: j.washi_tape ?? undefined,
        stamp: j.stamp ?? undefined,
        stickers: j.stickers_json ? safeJsonParse(j.stickers_json, []) : [],
        attachments: meta.attachments || [],
        createdAt: j.created_at || now,
        updatedAt: j.updated_at ? new Date(j.updated_at).getTime() : now,
      };
    });

    if (typeof localStorage !== "undefined") {
      localStorage.setItem("aero_todos", JSON.stringify(pulledTasks));
      localStorage.setItem("aero_completed_todos", JSON.stringify(pulledCompleted));
      localStorage.setItem("aero_sticky_notes", JSON.stringify(pulledNotes));
      localStorage.setItem("aero_pomodoro_logs", JSON.stringify(pulledPomodoro));
      localStorage.setItem("tongyun_countdowns", JSON.stringify(pulledCountdowns));
      localStorage.setItem("tongyun_journal", JSON.stringify(pulledJournal));
      localStorage.setItem("tongyun_last_updated", String(now));
      localStorage.setItem("tongyun_sync_version", String(now));
    }

    if (typeof window !== "undefined") {
      const syncDataPayload = {
        version: now,
        tasks: pulledTasks,
        completedTasks: pulledCompleted,
        stickyNotes: pulledNotes,
        pomodoroLogs: pulledPomodoro,
        countdowns: pulledCountdowns,
        customizationConfig: null,
        journal: pulledJournal,
      };
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: syncDataPayload }));
    }
  } catch (err) {
    console.warn("[remoteDbSync] Failed to reload and broadcast local sync data:", err);
  }

  return stats;
}

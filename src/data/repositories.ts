import type {
  CountdownEvent,
  DomainAgent,
  DomainTaskDispatch,
  HabitItem,
  JournalEntry,
  PomodoroLog,
  StickyNote,
  Task,
  TaskCategory,
  TaskPriority,
  TaskRunStatus,
  TimeBlock,
} from "../types";
import { safeJsonParse } from "../utils/json";
import { getDomainDatabase, queueDomainWrite } from "./domainDatabase";

type DataRow = { id: string; data: string };

interface DbTaskRow {
  id: string;
  title?: string;
  description?: string | null;
  notes?: string | null;
  category?: string;
  due_date?: string | null;
  due_time?: string | null;
  is_favorite?: number;
  is_pinned?: number;
  repeat_rule?: string | null;
  repeat_anchor_day?: number | null;
  priority?: string | null;
  energy_level?: string | null;
  estimated_pomodoros?: number | null;
  journal_id?: string | null;
  completed_at?: number | null;
  assignee_kind?: string | null;
  assignee_agent_id?: string | null;
  run_status?: string | null;
  stamp?: string | null;
  time_block_start?: string | null;
  time_block_end?: string | null;
  subtasks_json?: string | null;
  tags_json?: string | null;
  depends_on_json?: string | null;
  attachments_json?: string | null;
  data?: string | null;
  updated_at?: number;
}

function parseTaskRow(row: DbTaskRow): Task {
  let task: Task;
  if (row.data) {
    task = safeJsonParse<Task>(row.data, {
      id: row.id,
      title: row.title || "",
      category: (row.category as TaskCategory) || "urgent-important",
    });
  } else {
    task = {
      id: row.id,
      title: row.title || "",
      category: (row.category as TaskCategory) || "urgent-important",
    };
  }
  task.id = row.id;
  if (row.title !== undefined) task.title = row.title;
  if (row.description !== undefined) task.description = row.description ?? undefined;
  if (row.notes !== undefined) task.notes = row.notes ?? undefined;
  if (row.category) task.category = row.category as TaskCategory;
  if (row.due_date !== undefined) task.dueDate = row.due_date ?? undefined;
  if (row.due_time !== undefined) task.dueTime = row.due_time ?? undefined;
  if (row.is_favorite !== undefined) task.isFavorite = Boolean(row.is_favorite);
  if (row.is_pinned !== undefined) task.isPinned = Boolean(row.is_pinned);
  if (row.repeat_rule !== undefined) task.repeat = row.repeat_rule ?? undefined;
  if (row.repeat_anchor_day != null) task.repeatAnchorDay = row.repeat_anchor_day;
  if (row.priority) task.priority = row.priority as TaskPriority;
  if (row.energy_level) task.energyLevel = row.energy_level as any;
  if (row.estimated_pomodoros != null) task.estimatedPomodoros = row.estimated_pomodoros;
  if (row.journal_id) task.journalId = row.journal_id;
  task.completedAt = row.completed_at ?? undefined;
  if (row.assignee_kind) task.assigneeKind = row.assignee_kind as any;
  if (row.assignee_agent_id !== undefined)
    task.assigneeAgentId = row.assignee_agent_id ?? undefined;
  if (row.run_status) task.runStatus = row.run_status as TaskRunStatus;
  if (row.stamp) task.stamp = row.stamp;
  if (row.time_block_start && row.time_block_end) {
    task.timeBlock = { start: row.time_block_start, end: row.time_block_end };
  }
  if (row.subtasks_json) task.subtasks = safeJsonParse(row.subtasks_json, task.subtasks || []);
  if (row.tags_json) task.tags = safeJsonParse(row.tags_json, task.tags || []);
  if (row.depends_on_json)
    task.dependsOn = safeJsonParse(row.depends_on_json, task.dependsOn || []);
  if (row.attachments_json)
    task.attachments = safeJsonParse(row.attachments_json, task.attachments || []);
  return task;
}

class TaskRepository {
  private queue: Promise<void> = Promise.resolve();

  private syncPartition(items: Task[], completed: boolean): void {
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const rows = await db
            .select<{ id: string; data: string }[]>(
              `SELECT id, data FROM tasks WHERE completed_at IS ${completed ? "NOT " : ""}NULL AND deleted_at IS NULL`,
            )
            .catch(async () => {
              return db.select<{ id: string; data: string }[]>(
                `SELECT id, data FROM domain_tasks WHERE completed_at IS ${completed ? "NOT " : ""}NULL`,
              );
            });

          const existing = new Map(rows.map((row) => [row.id, row.data]));
          const desiredIds = new Set(items.map((task) => task.id));
          await db.execute("BEGIN IMMEDIATE");
          try {
            for (const row of rows) {
              if (!desiredIds.has(row.id)) {
                await db
                  .execute("DELETE FROM tasks WHERE id = $1", [row.id])
                  .catch(() => undefined);
                await db
                  .execute("DELETE FROM domain_tasks WHERE id = $1", [row.id])
                  .catch(() => undefined);
              }
            }
            for (const task of items) {
              const data = JSON.stringify(task);
              if (existing.get(task.id) === data) continue;
              const now = Date.now();
              await db
                .execute(
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
                    task.id,
                    task.title,
                    task.description ?? null,
                    task.notes ?? null,
                    task.category,
                    task.dueDate ?? null,
                    task.dueTime ?? null,
                    task.isFavorite ? 1 : 0,
                    task.isPinned ? 1 : 0,
                    task.repeat ?? null,
                    task.repeatAnchorDay ?? null,
                    task.priority ?? "medium",
                    task.energyLevel ?? null,
                    task.estimatedPomodoros ?? null,
                    task.journalId ?? null,
                    task.completedAt ?? null,
                    task.assigneeKind ?? (task.assigneeAgentId ? "agent" : "human"),
                    task.assigneeAgentId ?? null,
                    task.runStatus ?? null,
                    task.stamp ?? null,
                    task.timeBlock?.start ?? null,
                    task.timeBlock?.end ?? null,
                    JSON.stringify(task.subtasks || []),
                    JSON.stringify(task.tags || []),
                    JSON.stringify(task.dependsOn || []),
                    JSON.stringify(task.attachments || []),
                    data,
                    now,
                  ],
                )
                .catch(() => undefined);

              // Maintain domain_tasks
              await db
                .execute(
                  `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data, assignee_kind, assignee_agent_id, run_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [
                    task.id,
                    task.completedAt ?? null,
                    task.dueDate ?? null,
                    now,
                    data,
                    task.assigneeKind ?? (task.assigneeAgentId ? "agent" : "human"),
                    task.assigneeAgentId ?? null,
                    task.runStatus ?? null,
                  ],
                )
                .catch(() => undefined);
            }
            await db.execute("COMMIT");
          } catch (error) {
            await db.execute("ROLLBACK").catch(() => undefined);
            throw error;
          }
        }),
      )
      .catch((error) => console.error("Task repository partition sync failed", error));
  }

  syncActive(tasks: Task[]): void {
    this.syncPartition(tasks, false);
  }

  syncCompleted(completed: Task[]): void {
    this.syncPartition(completed, true);
  }

  async load(): Promise<{ tasks: Task[]; completed: Task[] } | null> {
    const db = await getDomainDatabase();
    if (!db) return null;

    try {
      const rows = await db.select<DbTaskRow[]>(
        "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC",
      );
      if (rows && rows.length > 0) {
        const all = rows.map(parseTaskRow);
        return {
          tasks: all.filter((task) => !task.completedAt),
          completed: all.filter((task) => Boolean(task.completedAt)),
        };
      }
    } catch {
      // fallback to legacy domain_tasks table
    }

    try {
      const legacyRows = await db.select<DbTaskRow[]>(
        "SELECT id, data, assignee_kind, assignee_agent_id, run_status FROM domain_tasks ORDER BY updated_at DESC",
      );
      if (!legacyRows || legacyRows.length === 0) return null;
      const all = legacyRows.map(parseTaskRow);
      return {
        tasks: all.filter((task) => !task.completedAt),
        completed: all.filter((task) => Boolean(task.completedAt)),
      };
    } catch {
      return null;
    }
  }

  syncSnapshot(tasks: Task[], completed: Task[]): void {
    const desired = [...tasks, ...completed];
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const rows = await db
            .select<{ id: string; data: string }[]>(
              "SELECT id, data FROM tasks WHERE deleted_at IS NULL",
            )
            .catch(async () => {
              return db.select<{ id: string; data: string }[]>("SELECT id, data FROM domain_tasks");
            });

          const existing = new Map(rows.map((row) => [row.id, row.data]));
          const desiredIds = new Set(desired.map((task) => task.id));
          await db.execute("BEGIN IMMEDIATE");
          try {
            for (const row of rows) {
              if (!desiredIds.has(row.id)) {
                await db
                  .execute("DELETE FROM tasks WHERE id = $1", [row.id])
                  .catch(() => undefined);
                await db
                  .execute("DELETE FROM domain_tasks WHERE id = $1", [row.id])
                  .catch(() => undefined);
              }
            }
            for (const task of desired) {
              const data = JSON.stringify(task);
              if (existing.get(task.id) === data) continue;
              const now = Date.now();
              await db
                .execute(
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
                    task.id,
                    task.title,
                    task.description ?? null,
                    task.notes ?? null,
                    task.category,
                    task.dueDate ?? null,
                    task.dueTime ?? null,
                    task.isFavorite ? 1 : 0,
                    task.isPinned ? 1 : 0,
                    task.repeat ?? null,
                    task.repeatAnchorDay ?? null,
                    task.priority ?? "medium",
                    task.energyLevel ?? null,
                    task.estimatedPomodoros ?? null,
                    task.journalId ?? null,
                    task.completedAt ?? null,
                    task.assigneeKind ?? (task.assigneeAgentId ? "agent" : "human"),
                    task.assigneeAgentId ?? null,
                    task.runStatus ?? null,
                    task.stamp ?? null,
                    task.timeBlock?.start ?? null,
                    task.timeBlock?.end ?? null,
                    JSON.stringify(task.subtasks || []),
                    JSON.stringify(task.tags || []),
                    JSON.stringify(task.dependsOn || []),
                    JSON.stringify(task.attachments || []),
                    data,
                    now,
                  ],
                )
                .catch(() => undefined);

              await db
                .execute(
                  `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data, assignee_kind, assignee_agent_id, run_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [
                    task.id,
                    task.completedAt ?? null,
                    task.dueDate ?? null,
                    now,
                    data,
                    task.assigneeKind ?? (task.assigneeAgentId ? "agent" : "human"),
                    task.assigneeAgentId ?? null,
                    task.runStatus ?? null,
                  ],
                )
                .catch(() => undefined);
            }
            await db.execute("COMMIT");
          } catch (error) {
            await db.execute("ROLLBACK").catch(() => undefined);
            throw error;
          }
        }),
      )
      .catch((error) => console.error("Task repository sync failed", error));
  }
}

interface DbJournalRow {
  id: string;
  link_key: string;
  title: string;
  body: string | null;
  entry_date: string;
  is_daily: number;
  mood: string | null;
  ai_comment: string | null;
  template_id: string | null;
  washi_tape: string | null;
  stamp: string | null;
  stickers_json: string | null;
  attachments_json: string | null;
  data: string | null;
  created_at: number;
  updated_at: number;
}

function parseJournalRow(row: DbJournalRow): JournalEntry {
  let entry: JournalEntry;
  if (row.data) {
    entry = safeJsonParse<JournalEntry>(row.data, {
      id: row.id,
      linkKey: row.link_key,
      title: row.title,
      content: row.body || "",
      date: row.entry_date,
      isDaily: Boolean(row.is_daily),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } else {
    entry = {
      id: row.id,
      linkKey: row.link_key,
      title: row.title,
      content: row.body || "",
      date: row.entry_date,
      isDaily: Boolean(row.is_daily),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  entry.id = row.id;
  entry.linkKey = row.link_key || entry.linkKey || row.entry_date;
  entry.title = row.title || entry.title;
  entry.content = row.body ?? entry.content ?? "";
  entry.date = row.entry_date || entry.date;
  entry.isDaily = Boolean(row.is_daily);
  if (row.mood) entry.mood = row.mood;
  if (row.ai_comment) entry.aiComment = row.ai_comment;
  if (row.template_id) entry.templateId = row.template_id;
  if (row.washi_tape) entry.washiTape = row.washi_tape;
  if (row.stamp) entry.stamp = row.stamp;
  if (row.stickers_json) entry.stickers = safeJsonParse(row.stickers_json, entry.stickers || []);
  if (row.attachments_json)
    entry.attachments = safeJsonParse(row.attachments_json, entry.attachments || []);
  entry.createdAt = row.created_at || entry.createdAt;
  entry.updatedAt = row.updated_at || entry.updatedAt;
  return entry;
}

class JournalRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<JournalEntry[] | null> {
    const db = await getDomainDatabase();
    if (!db) return null;

    try {
      const rows = await db.select<DbJournalRow[]>(
        "SELECT * FROM journal_entries WHERE deleted_at IS NULL ORDER BY updated_at DESC",
      );
      if (rows && rows.length > 0) {
        return rows.map(parseJournalRow);
      }
    } catch {
      // fallback to legacy domain_journal
    }

    try {
      const legacyRows = await db.select<DataRow[]>(
        "SELECT id, data FROM domain_journal ORDER BY updated_at DESC",
      );
      if (!legacyRows || legacyRows.length === 0) return null;
      return legacyRows.map((row) => JSON.parse(row.data) as JournalEntry);
    } catch {
      return null;
    }
  }

  syncSnapshot(entries: JournalEntry[]): void {
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const rows = await db
            .select<DataRow[]>("SELECT id, data FROM journal_entries WHERE deleted_at IS NULL")
            .catch(async () => db.select<DataRow[]>("SELECT id, data FROM domain_journal"));

          const existing = new Map(rows.map((row) => [row.id, row.data]));
          const desiredIds = new Set(entries.map((entry) => entry.id));
          await db.execute("BEGIN IMMEDIATE");
          try {
            for (const row of rows) {
              if (!desiredIds.has(row.id)) {
                await db
                  .execute("DELETE FROM journal_entries WHERE id = $1", [row.id])
                  .catch(() => undefined);
                await db
                  .execute("DELETE FROM domain_journal WHERE id = $1", [row.id])
                  .catch(() => undefined);
              }
            }
            for (const entry of entries) {
              const data = JSON.stringify(entry);
              if (existing.get(entry.id) === data) continue;
              const now = Date.now();
              await db
                .execute(
                  `INSERT OR REPLACE INTO journal_entries (
                  id, link_key, title, body, entry_date, is_daily, mood,
                  ai_comment, template_id, washi_tape, stamp, stickers_json,
                  attachments_json, data, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                )`,
                  [
                    entry.id,
                    entry.linkKey || entry.date,
                    entry.title,
                    entry.content,
                    entry.date,
                    entry.isDaily ? 1 : 0,
                    entry.mood ?? null,
                    entry.aiComment ?? null,
                    entry.templateId ?? null,
                    entry.washiTape ?? null,
                    entry.stamp ?? null,
                    JSON.stringify(entry.stickers || []),
                    JSON.stringify(entry.attachments || []),
                    data,
                    entry.createdAt || now,
                    entry.updatedAt || now,
                  ],
                )
                .catch(() => undefined);

              await db
                .execute(
                  `INSERT OR REPLACE INTO domain_journal(id, entry_date, is_daily, updated_at, data)
                 VALUES ($1, $2, $3, $4, $5)`,
                  [entry.id, entry.date, entry.isDaily ? 1 : 0, entry.updatedAt ?? now, data],
                )
                .catch(() => undefined);
            }
            await db.execute("COMMIT");
          } catch (error) {
            await db.execute("ROLLBACK").catch(() => undefined);
            throw error;
          }
        }),
      )
      .catch((error) => console.error("Journal repository sync failed", error));
  }

  upsert(entry: JournalEntry): void {
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const data = JSON.stringify(entry);
          const now = Date.now();
          await db
            .execute(
              `INSERT OR REPLACE INTO journal_entries (
              id, link_key, title, body, entry_date, is_daily, mood,
              ai_comment, template_id, washi_tape, stamp, stickers_json,
              attachments_json, data, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )`,
              [
                entry.id,
                entry.linkKey || entry.date,
                entry.title,
                entry.content,
                entry.date,
                entry.isDaily ? 1 : 0,
                entry.mood ?? null,
                entry.aiComment ?? null,
                entry.templateId ?? null,
                entry.washiTape ?? null,
                entry.stamp ?? null,
                JSON.stringify(entry.stickers || []),
                JSON.stringify(entry.attachments || []),
                data,
                entry.createdAt || now,
                entry.updatedAt || now,
              ],
            )
            .catch(() => undefined);

          await db
            .execute(
              `INSERT OR REPLACE INTO domain_journal(id, entry_date, is_daily, updated_at, data)
             VALUES ($1, $2, $3, $4, $5)`,
              [entry.id, entry.date, entry.isDaily ? 1 : 0, entry.updatedAt ?? now, data],
            )
            .catch(() => undefined);
        }),
      )
      .catch((error) => console.error("Journal repository upsert failed", error));
  }

  delete(id: string): void {
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          await db
            .execute("DELETE FROM journal_entries WHERE id = $1", [id])
            .catch(() => undefined);
          await db.execute("DELETE FROM domain_journal WHERE id = $1", [id]).catch(() => undefined);
        }),
      )
      .catch((error) => console.error("Journal repository delete failed", error));
  }
}

const DEFAULT_AGENTS: DomainAgent[] = [
  {
    id: "agent_local_assistant",
    handle: "本地助手",
    kind: "manual",
    enabled: true,
    meta: {},
    updatedAt: 1729785600000,
  },
];

class AgentRepository {
  private queue: Promise<void> = Promise.resolve();
  private cachedAgents: DomainAgent[] | null = null;

  private readFromLocalStorage(): DomainAgent[] {
    if (typeof localStorage === "undefined") return DEFAULT_AGENTS;
    const local = safeJsonParse<DomainAgent[]>(
      localStorage.getItem("tongyun_domain_agents") || "[]",
      [],
    );
    if (local.length > 0) return local;
    localStorage.setItem("tongyun_domain_agents", JSON.stringify(DEFAULT_AGENTS));
    return DEFAULT_AGENTS;
  }

  async load(): Promise<DomainAgent[]> {
    if (this.cachedAgents) return this.cachedAgents;
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db
          .select<
            {
              id: string;
              handle: string;
              kind: string;
              enabled: number;
              meta: string;
              updated_at: number;
            }[]
          >(
            "SELECT id, handle, kind, enabled, meta, updated_at FROM agents WHERE deleted_at IS NULL ORDER BY updated_at ASC",
          )
          .catch(async () => {
            return db.select<
              {
                id: string;
                handle: string;
                kind: string;
                enabled: number;
                meta: string;
                updated_at: number;
              }[]
            >(
              "SELECT id, handle, kind, enabled, meta, updated_at FROM domain_agents ORDER BY updated_at ASC",
            );
          });

        if (rows && rows.length > 0) {
          this.cachedAgents = rows.map((r) => ({
            id: r.id,
            handle: r.handle,
            kind: r.kind as any,
            enabled: Boolean(r.enabled),
            meta: safeJsonParse(r.meta || "{}", {}),
            updatedAt: r.updated_at,
          }));
          return this.cachedAgents;
        }
      } catch (e) {
        console.warn("Failed to load agents from db, falling back to local storage", e);
      }
    }
    this.cachedAgents = this.readFromLocalStorage();
    return this.cachedAgents;
  }

  async save(agent: DomainAgent): Promise<void> {
    const current = await this.load();
    const idx = current.findIndex((a) => a.id === agent.id);
    const updated =
      idx >= 0 ? current.map((a) => (a.id === agent.id ? agent : a)) : [...current, agent];
    this.cachedAgents = updated;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_domain_agents", JSON.stringify(updated));
    }

    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const metaStr =
            typeof agent.meta === "string" ? agent.meta : JSON.stringify(agent.meta || {});
          const now = agent.updatedAt || Date.now();
          await db
            .execute(
              `INSERT OR REPLACE INTO agents(id, handle, kind, enabled, meta, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
              [agent.id, agent.handle, agent.kind, agent.enabled ? 1 : 0, metaStr, now],
            )
            .catch(() => undefined);

          await db
            .execute(
              `INSERT OR REPLACE INTO domain_agents(id, handle, kind, enabled, meta, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
              [agent.id, agent.handle, agent.kind, agent.enabled ? 1 : 0, metaStr, now],
            )
            .catch(() => undefined);
        }),
      )
      .catch((err) => console.error("AgentRepository save failed", err));
    return this.queue;
  }

  async delete(id: string): Promise<void> {
    const current = await this.load();
    const updated = current.filter((a) => a.id !== id);
    this.cachedAgents = updated;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_domain_agents", JSON.stringify(updated));
    }

    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          await db.execute("DELETE FROM agents WHERE id = $1", [id]).catch(() => undefined);
          await db.execute("DELETE FROM domain_agents WHERE id = $1", [id]).catch(() => undefined);
        }),
      )
      .catch((err) => console.error("AgentRepository delete failed", err));
    return this.queue;
  }

  async getEnabled(): Promise<DomainAgent[]> {
    const all = await this.load();
    return all.filter((a) => a.enabled);
  }
}

class DispatchRepository {
  private queue: Promise<void> = Promise.resolve();
  private cachedDispatches: DomainTaskDispatch[] | null = null;

  private readFromLocalStorage(): DomainTaskDispatch[] {
    if (typeof localStorage === "undefined") return [];
    return safeJsonParse<DomainTaskDispatch[]>(
      localStorage.getItem("tongyun_task_dispatches") || "[]",
      [],
    );
  }

  async loadAll(): Promise<DomainTaskDispatch[]> {
    if (this.cachedDispatches) return this.cachedDispatches;
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db
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
            "SELECT id, task_id, agent_id, status, note, pipeline_task_id, created_at, updated_at FROM task_dispatch ORDER BY created_at DESC",
          )
          .catch(async () => {
            return db.select<
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
              "SELECT id, task_id, agent_id, status, note, pipeline_task_id, created_at, updated_at FROM domain_task_dispatch ORDER BY created_at DESC",
            );
          });

        if (rows && rows.length > 0) {
          this.cachedDispatches = rows.map((r) => ({
            id: r.id,
            taskId: r.task_id,
            agentId: r.agent_id,
            status: r.status as any,
            note: r.note || undefined,
            pipelineTaskId: r.pipeline_task_id || undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          }));
          return this.cachedDispatches;
        }
      } catch (e) {
        console.warn("Failed to load dispatches from db, falling back to local storage", e);
      }
    }
    this.cachedDispatches = this.readFromLocalStorage();
    return this.cachedDispatches;
  }

  async recordDispatch(
    taskId: string,
    agentId: string,
    status: TaskRunStatus = "queued",
    note?: string,
  ): Promise<DomainTaskDispatch> {
    const now = Date.now();
    const dispatch: DomainTaskDispatch = {
      id: "disp_" + now + "_" + Math.random().toString(36).substring(2, 7),
      taskId,
      agentId,
      status,
      note,
      createdAt: now,
      updatedAt: now,
    };

    const current = this.cachedDispatches || this.readFromLocalStorage();
    const updated = [
      dispatch,
      ...current.filter(
        (d) => d.taskId !== taskId || (d.status !== "queued" && d.status !== "running"),
      ),
    ];
    this.cachedDispatches = updated;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_task_dispatches", JSON.stringify(updated));
    }

    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          await db
            .execute(
              `INSERT INTO task_dispatch(id, task_id, agent_id, status, note, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                dispatch.id,
                dispatch.taskId,
                dispatch.agentId,
                dispatch.status,
                dispatch.note ?? null,
                dispatch.createdAt,
                dispatch.updatedAt,
              ],
            )
            .catch(() => undefined);

          await db
            .execute(
              `INSERT INTO domain_task_dispatch(id, task_id, agent_id, status, note, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                dispatch.id,
                dispatch.taskId,
                dispatch.agentId,
                dispatch.status,
                dispatch.note ?? null,
                dispatch.createdAt,
                dispatch.updatedAt,
              ],
            )
            .catch(() => undefined);
        }),
      )
      .catch((err) => console.error("DispatchRepository recordDispatch failed", err));

    return dispatch;
  }

  async cancelDispatch(taskId: string): Promise<void> {
    const now = Date.now();
    const current = this.cachedDispatches || this.readFromLocalStorage();
    const updated = current.map((d) =>
      d.taskId === taskId && (d.status === "queued" || d.status === "running")
        ? { ...d, status: "cancelled" as TaskRunStatus, updatedAt: now }
        : d,
    );
    this.cachedDispatches = updated;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_task_dispatches", JSON.stringify(updated));
    }

    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          await db
            .execute(
              `UPDATE task_dispatch
             SET status = 'cancelled', updated_at = $1
             WHERE task_id = $2 AND status IN ('queued', 'running')`,
              [now, taskId],
            )
            .catch(() => undefined);

          await db
            .execute(
              `UPDATE domain_task_dispatch
             SET status = 'cancelled', updated_at = $1
             WHERE task_id = $2 AND status IN ('queued', 'running')`,
              [now, taskId],
            )
            .catch(() => undefined);
        }),
      )
      .catch((err) => console.error("DispatchRepository cancelDispatch failed", err));
    return this.queue;
  }

  async updateStatus(taskId: string, status: TaskRunStatus, note?: string): Promise<void> {
    const now = Date.now();
    const current = this.cachedDispatches || this.readFromLocalStorage();
    let found = false;
    const updated = current.map((d) => {
      if (!found && d.taskId === taskId && (d.status === "queued" || d.status === "running")) {
        found = true;
        return { ...d, status, note: note !== undefined ? note : d.note, updatedAt: now };
      }
      return d;
    });
    this.cachedDispatches = updated;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_task_dispatches", JSON.stringify(updated));
    }

    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          await db
            .execute(
              `UPDATE task_dispatch
             SET status = $1, note = COALESCE($2, note), updated_at = $3
             WHERE task_id = $4 AND status IN ('queued', 'running')`,
              [status, note ?? null, now, taskId],
            )
            .catch(() => undefined);

          await db
            .execute(
              `UPDATE domain_task_dispatch
             SET status = $1, note = COALESCE($2, note), updated_at = $3
             WHERE task_id = $4 AND status IN ('queued', 'running')`,
              [status, note ?? null, now, taskId],
            )
            .catch(() => undefined);
        }),
      )
      .catch((err) => console.error("DispatchRepository updateStatus failed", err));
    return this.queue;
  }

  async getDispatchForTask(taskId: string): Promise<DomainTaskDispatch | null> {
    const all = await this.loadAll();
    return all.find((d) => d.taskId === taskId) || null;
  }
}

class StickyNoteRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<StickyNote[]> {
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db.select<
          {
            id: string;
            title: string | null;
            text: string;
            color: string;
            rotate: number;
            data: string | null;
          }[]
        >(
          "SELECT id, title, text, color, rotate, data FROM sticky_notes WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        );
        if (rows && rows.length > 0) {
          return rows.map((r) =>
            r.data
              ? safeJsonParse(r.data, {
                  id: r.id,
                  text: r.text,
                  color: r.color,
                  rotate: r.rotate,
                  title: r.title ?? undefined,
                })
              : {
                  id: r.id,
                  text: r.text,
                  color: r.color,
                  rotate: r.rotate,
                  title: r.title ?? undefined,
                },
          );
        }
      } catch {
        // ignore and fallback to localStorage
      }
    }
    if (typeof localStorage !== "undefined") {
      return safeJsonParse(localStorage.getItem("aero_sticky_notes") || "[]", []);
    }
    return [];
  }

  syncSnapshot(notes: StickyNote[]): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("aero_sticky_notes", JSON.stringify(notes));
    }
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const now = Date.now();
          const desiredIds = new Set(notes.map((n) => n.id));
          const existing = await db
            .select<{ id: string }[]>("SELECT id FROM sticky_notes WHERE deleted_at IS NULL")
            .catch(() => []);
          for (const row of existing) {
            if (!desiredIds.has(row.id)) {
              await db
                .execute("DELETE FROM sticky_notes WHERE id = $1", [row.id])
                .catch(() => undefined);
            }
          }
          for (const n of notes) {
            await db
              .execute(
                `INSERT OR REPLACE INTO sticky_notes (id, title, text, color, rotate, updated_at, data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [n.id, n.title ?? null, n.text, n.color, n.rotate || 0, now, JSON.stringify(n)],
              )
              .catch(() => undefined);
          }
        }),
      )
      .catch((e) => console.error("StickyNoteRepository sync failed", e));
  }
}

class CountdownRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<CountdownEvent[]> {
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db.select<
          {
            id: string;
            title: string;
            target_date: string;
            emoji: string | null;
            color: string | null;
            is_lunar: number;
            data: string | null;
          }[]
        >(
          "SELECT id, title, target_date, emoji, color, is_lunar, data FROM countdowns WHERE deleted_at IS NULL ORDER BY target_date ASC",
        );
        if (rows && rows.length > 0) {
          return rows.map((r) =>
            r.data
              ? safeJsonParse(r.data, {
                  id: r.id,
                  title: r.title,
                  targetDate: r.target_date,
                  emoji: r.emoji ?? undefined,
                  color: r.color ?? undefined,
                  isLunar: Boolean(r.is_lunar),
                })
              : {
                  id: r.id,
                  title: r.title,
                  targetDate: r.target_date,
                  emoji: r.emoji ?? undefined,
                  color: r.color ?? undefined,
                  isLunar: Boolean(r.is_lunar),
                },
          );
        }
      } catch {
        // ignore and fallback to localStorage
      }
    }
    if (typeof localStorage !== "undefined") {
      return safeJsonParse(localStorage.getItem("tongyun_countdowns") || "[]", []);
    }
    return [];
  }

  syncSnapshot(events: CountdownEvent[]): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_countdowns", JSON.stringify(events));
    }
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const now = Date.now();
          const desiredIds = new Set(events.map((e) => e.id));
          const existing = await db
            .select<{ id: string }[]>("SELECT id FROM countdowns WHERE deleted_at IS NULL")
            .catch(() => []);
          for (const row of existing) {
            if (!desiredIds.has(row.id)) {
              await db
                .execute("DELETE FROM countdowns WHERE id = $1", [row.id])
                .catch(() => undefined);
            }
          }
          for (const e of events) {
            await db
              .execute(
                `INSERT OR REPLACE INTO countdowns (id, title, target_date, emoji, color, is_lunar, updated_at, data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  e.id,
                  e.title,
                  e.targetDate,
                  e.emoji ?? null,
                  e.color ?? null,
                  e.isLunar ? 1 : 0,
                  now,
                  JSON.stringify(e),
                ],
              )
              .catch(() => undefined);
          }
        }),
      )
      .catch((e) => console.error("CountdownRepository sync failed", e));
  }
}

class TimeBlockRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<TimeBlock[]> {
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db.select<
          {
            id: string;
            date: string;
            start_time: string;
            end_time: string;
            task_id: string | null;
            title: string;
            color: string;
            data: string | null;
          }[]
        >(
          "SELECT id, date, start_time, end_time, task_id, title, color, data FROM timeblocks WHERE deleted_at IS NULL ORDER BY date ASC, start_time ASC",
        );
        if (rows && rows.length > 0) {
          return rows.map((r) =>
            r.data
              ? safeJsonParse(r.data, {
                  id: r.id,
                  date: r.date,
                  startTime: r.start_time,
                  endTime: r.end_time,
                  taskId: r.task_id ?? undefined,
                  title: r.title,
                  color: r.color,
                })
              : {
                  id: r.id,
                  date: r.date,
                  startTime: r.start_time,
                  endTime: r.end_time,
                  taskId: r.task_id ?? undefined,
                  title: r.title,
                  color: r.color,
                },
          );
        }
      } catch {
        // ignore and fallback to localStorage
      }
    }
    if (typeof localStorage !== "undefined") {
      return safeJsonParse(localStorage.getItem("tongyun_timeblocks") || "[]", []);
    }
    return [];
  }

  syncSnapshot(blocks: TimeBlock[]): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_timeblocks", JSON.stringify(blocks));
    }
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const now = Date.now();
          const desiredIds = new Set(blocks.map((b) => b.id));
          const existing = await db
            .select<{ id: string }[]>("SELECT id FROM timeblocks WHERE deleted_at IS NULL")
            .catch(() => []);
          for (const row of existing) {
            if (!desiredIds.has(row.id)) {
              await db
                .execute("DELETE FROM timeblocks WHERE id = $1", [row.id])
                .catch(() => undefined);
            }
          }
          for (const b of blocks) {
            await db
              .execute(
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
                  now,
                  JSON.stringify(b),
                ],
              )
              .catch(() => undefined);
          }
        }),
      )
      .catch((e) => console.error("TimeBlockRepository sync failed", e));
  }
}

class PomodoroRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<PomodoroLog[]> {
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db.select<
          {
            id: string;
            timestamp: number;
            duration: number;
            task_id: string | null;
            task_title: string | null;
            data: string | null;
          }[]
        >(
          "SELECT id, timestamp, duration, task_id, task_title, data FROM pomodoro_logs WHERE deleted_at IS NULL ORDER BY timestamp DESC",
        );
        if (rows && rows.length > 0) {
          return rows.map((r) =>
            r.data
              ? safeJsonParse(r.data, {
                  id: r.id,
                  timestamp: r.timestamp,
                  duration: r.duration,
                  taskId: r.task_id ?? undefined,
                  taskTitle: r.task_title ?? undefined,
                })
              : {
                  id: r.id,
                  timestamp: r.timestamp,
                  duration: r.duration,
                  taskId: r.task_id ?? undefined,
                  taskTitle: r.task_title ?? undefined,
                },
          );
        }
      } catch {
        // ignore and fallback to localStorage
      }
    }
    if (typeof localStorage !== "undefined") {
      return safeJsonParse(localStorage.getItem("aero_pomodoro_logs") || "[]", []);
    }
    return [];
  }

  syncSnapshot(logs: PomodoroLog[]): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("aero_pomodoro_logs", JSON.stringify(logs));
    }
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const desiredIds = new Set(logs.map((l) => l.id));
          const existing = await db
            .select<{ id: string }[]>("SELECT id FROM pomodoro_logs WHERE deleted_at IS NULL")
            .catch(() => []);
          for (const row of existing) {
            if (!desiredIds.has(row.id)) {
              await db
                .execute("DELETE FROM pomodoro_logs WHERE id = $1", [row.id])
                .catch(() => undefined);
            }
          }
          for (const l of logs) {
            await db
              .execute(
                `INSERT OR REPLACE INTO pomodoro_logs (id, timestamp, duration, task_id, task_title, created_at, data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  l.id,
                  l.timestamp,
                  l.duration,
                  l.taskId ?? null,
                  l.taskTitle ?? null,
                  l.timestamp,
                  JSON.stringify(l),
                ],
              )
              .catch(() => undefined);
          }
        }),
      )
      .catch((e) => console.error("PomodoroRepository sync failed", e));
  }
}

class HabitRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<HabitItem[]> {
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db.select<
          {
            id: string;
            name: string;
            emoji: string | null;
            done_today: number;
            streak: number;
            last_done_date: string | null;
            data: string | null;
          }[]
        >(
          "SELECT id, name, emoji, done_today, streak, last_done_date, data FROM habits WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        );
        if (rows && rows.length > 0) {
          return rows.map((r) =>
            r.data
              ? safeJsonParse(r.data, {
                  id: r.id,
                  name: r.name,
                  emoji: r.emoji || "✨",
                  doneToday: Boolean(r.done_today),
                  streak: r.streak,
                  lastDoneDate: r.last_done_date ?? undefined,
                })
              : {
                  id: r.id,
                  name: r.name,
                  emoji: r.emoji || "✨",
                  doneToday: Boolean(r.done_today),
                  streak: r.streak,
                  lastDoneDate: r.last_done_date ?? undefined,
                },
          );
        }
      } catch {
        // ignore and fallback to localStorage
      }
    }
    if (typeof localStorage !== "undefined") {
      return safeJsonParse(localStorage.getItem("tongyun_habits") || "[]", []);
    }
    return [];
  }

  syncSnapshot(habits: HabitItem[]): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_habits", JSON.stringify(habits));
    }
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const now = Date.now();
          const desiredIds = new Set(habits.map((h) => h.id));
          const existing = await db
            .select<{ id: string }[]>("SELECT id FROM habits WHERE deleted_at IS NULL")
            .catch(() => []);
          for (const row of existing) {
            if (!desiredIds.has(row.id)) {
              await db.execute("DELETE FROM habits WHERE id = $1", [row.id]).catch(() => undefined);
            }
          }
          for (const h of habits) {
            await db
              .execute(
                `INSERT OR REPLACE INTO habits (id, name, emoji, done_today, streak, last_done_date, updated_at, data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  h.id,
                  h.name,
                  h.emoji,
                  h.doneToday ? 1 : 0,
                  h.streak,
                  h.lastDoneDate ?? null,
                  now,
                  JSON.stringify(h),
                ],
              )
              .catch(() => undefined);
          }
        }),
      )
      .catch((e) => console.error("HabitRepository sync failed", e));
  }
}

export const taskRepository = new TaskRepository();
export const journalRepository = new JournalRepository();
export const agentRepository = new AgentRepository();
export const dispatchRepository = new DispatchRepository();
export const stickyNoteRepository = new StickyNoteRepository();
export const countdownRepository = new CountdownRepository();
export const timeBlockRepository = new TimeBlockRepository();
export const pomodoroRepository = new PomodoroRepository();
export const habitRepository = new HabitRepository();

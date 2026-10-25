import type { DomainAgent, DomainTaskDispatch, JournalEntry, Task, TaskRunStatus } from "../types";
import { safeJsonParse } from "../utils/json";
import { getDomainDatabase, queueDomainWrite } from "./domainDatabase";

type DataRow = { id: string; data: string };
type TaskRow = DataRow & {
  assignee_kind?: string | null;
  assignee_agent_id?: string | null;
  run_status?: string | null;
};

class TaskRepository {
  private queue: Promise<void> = Promise.resolve();

  private syncPartition(items: Task[], completed: boolean): void {
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const rows = await db.select<DataRow[]>(
            `SELECT id, data FROM domain_tasks WHERE completed_at IS ${completed ? "NOT " : ""}NULL`,
          );
          const existing = new Map(rows.map((row) => [row.id, row.data]));
          const desiredIds = new Set(items.map((task) => task.id));
          await db.execute("BEGIN IMMEDIATE");
          try {
            for (const row of rows) {
              if (!desiredIds.has(row.id))
                await db.execute("DELETE FROM domain_tasks WHERE id = $1", [row.id]);
            }
            for (const task of items) {
              const data = JSON.stringify(task);
              if (existing.get(task.id) === data) continue;
              await db.execute(
                `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data, assignee_kind, assignee_agent_id, run_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  task.id,
                  task.completedAt ?? null,
                  task.dueDate ?? null,
                  Date.now(),
                  data,
                  task.assigneeKind ?? (task.assigneeAgentId ? "agent" : "human"),
                  task.assigneeAgentId ?? null,
                  task.runStatus ?? null,
                ],
              );
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
    const rows = await db.select<TaskRow[]>(
      "SELECT id, data, assignee_kind, assignee_agent_id, run_status FROM domain_tasks ORDER BY updated_at DESC",
    );
    if (rows.length === 0) return null;
    const all = rows.map((row) => {
      const task = JSON.parse(row.data) as Task;
      if (row.assignee_kind) task.assigneeKind = row.assignee_kind as any;
      if (row.assignee_agent_id) task.assigneeAgentId = row.assignee_agent_id;
      if (row.run_status) task.runStatus = row.run_status as any;
      return task;
    });
    return {
      tasks: all.filter((task) => !task.completedAt),
      completed: all.filter((task) => Boolean(task.completedAt)),
    };
  }

  syncSnapshot(tasks: Task[], completed: Task[]): void {
    const desired = [...tasks, ...completed];
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const rows = await db.select<DataRow[]>("SELECT id, data FROM domain_tasks");
          const existing = new Map(rows.map((row) => [row.id, row.data]));
          const desiredIds = new Set(desired.map((task) => task.id));
          await db.execute("BEGIN IMMEDIATE");
          try {
            for (const row of rows) {
              if (!desiredIds.has(row.id))
                await db.execute("DELETE FROM domain_tasks WHERE id = $1", [row.id]);
            }
            for (const task of desired) {
              const data = JSON.stringify(task);
              if (existing.get(task.id) === data) continue;
              await db.execute(
                `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data, assignee_kind, assignee_agent_id, run_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  task.id,
                  task.completedAt ?? null,
                  task.dueDate ?? null,
                  Date.now(),
                  data,
                  task.assigneeKind ?? (task.assigneeAgentId ? "agent" : "human"),
                  task.assigneeAgentId ?? null,
                  task.runStatus ?? null,
                ],
              );
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

class JournalRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<JournalEntry[] | null> {
    const db = await getDomainDatabase();
    if (!db) return null;
    const rows = await db.select<DataRow[]>(
      "SELECT id, data FROM domain_journal ORDER BY updated_at DESC",
    );
    if (rows.length === 0) return null;
    return rows.map((row) => JSON.parse(row.data) as JournalEntry);
  }

  syncSnapshot(entries: JournalEntry[]): void {
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          const rows = await db.select<DataRow[]>("SELECT id, data FROM domain_journal");
          const existing = new Map(rows.map((row) => [row.id, row.data]));
          const desiredIds = new Set(entries.map((entry) => entry.id));
          await db.execute("BEGIN IMMEDIATE");
          try {
            for (const row of rows) {
              if (!desiredIds.has(row.id))
                await db.execute("DELETE FROM domain_journal WHERE id = $1", [row.id]);
            }
            for (const entry of entries) {
              const data = JSON.stringify(entry);
              if (existing.get(entry.id) === data) continue;
              await db.execute(
                `INSERT OR REPLACE INTO domain_journal(id, entry_date, is_daily, updated_at, data)
             VALUES ($1, $2, $3, $4, $5)`,
                [entry.id, entry.date, entry.isDaily ? 1 : 0, entry.updatedAt ?? Date.now(), data],
              );
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
          await db.execute(
            `INSERT OR REPLACE INTO domain_journal(id, entry_date, is_daily, updated_at, data)
         VALUES ($1, $2, $3, $4, $5)`,
            [
              entry.id,
              entry.date,
              entry.isDaily ? 1 : 0,
              entry.updatedAt ?? Date.now(),
              JSON.stringify(entry),
            ],
          );
        }),
      )
      .catch((error) => console.error("Journal repository upsert failed", error));
  }

  delete(id: string): void {
    this.queue = this.queue
      .then(() =>
        queueDomainWrite(async (db) => {
          await db.execute("DELETE FROM domain_journal WHERE id = $1", [id]);
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
    const local = safeJsonParse<DomainAgent[]>(localStorage.getItem("tongyun_domain_agents") || "[]", []);
    if (local.length > 0) return local;
    localStorage.setItem("tongyun_domain_agents", JSON.stringify(DEFAULT_AGENTS));
    return DEFAULT_AGENTS;
  }

  async load(): Promise<DomainAgent[]> {
    if (this.cachedAgents) return this.cachedAgents;
    const db = await getDomainDatabase();
    if (db) {
      try {
        const rows = await db.select<
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
          await db.execute(
            `INSERT OR REPLACE INTO domain_agents(id, handle, kind, enabled, meta, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              agent.id,
              agent.handle,
              agent.kind,
              agent.enabled ? 1 : 0,
              typeof agent.meta === "string" ? agent.meta : JSON.stringify(agent.meta || {}),
              agent.updatedAt || Date.now(),
            ],
          );
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
          await db.execute("DELETE FROM domain_agents WHERE id = $1", [id]);
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
        const rows = await db.select<
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
          await db.execute(
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
          );
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
          await db.execute(
            `UPDATE domain_task_dispatch
           SET status = 'cancelled', updated_at = $1
           WHERE task_id = $2 AND status IN ('queued', 'running')`,
            [now, taskId],
          );
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
          await db.execute(
            `UPDATE domain_task_dispatch
           SET status = $1, note = COALESCE($2, note), updated_at = $3
           WHERE task_id = $4 AND status IN ('queued', 'running')`,
            [status, note ?? null, now, taskId],
          );
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

export const taskRepository = new TaskRepository();
export const journalRepository = new JournalRepository();
export const agentRepository = new AgentRepository();
export const dispatchRepository = new DispatchRepository();

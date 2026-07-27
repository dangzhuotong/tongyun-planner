import type { JournalEntry, Task } from "../types";
import { getDomainDatabase, queueDomainWrite } from "./domainDatabase";

type DataRow = { id: string; data: string };

class TaskRepository {
  private queue: Promise<void> = Promise.resolve();

  private syncPartition(items: Task[], completed: boolean): void {
    this.queue = this.queue.then(() => queueDomainWrite(async (db) => {
      const rows = await db.select<DataRow[]>(
        `SELECT id, data FROM domain_tasks WHERE completed_at IS ${completed ? "NOT " : ""}NULL`,
      );
      const existing = new Map(rows.map((row) => [row.id, row.data]));
      const desiredIds = new Set(items.map((task) => task.id));
      await db.execute("BEGIN IMMEDIATE");
      try {
        for (const row of rows) {
          if (!desiredIds.has(row.id)) await db.execute("DELETE FROM domain_tasks WHERE id = $1", [row.id]);
        }
        for (const task of items) {
          const data = JSON.stringify(task);
          if (existing.get(task.id) === data) continue;
          await db.execute(
            `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data)
             VALUES ($1, $2, $3, $4, $5)`,
            [task.id, task.completedAt ?? null, task.dueDate ?? null, Date.now(), data],
          );
        }
        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK").catch(() => undefined);
        throw error;
      }
    })).catch((error) => console.error("Task repository partition sync failed", error));
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
    const rows = await db.select<DataRow[]>("SELECT id, data FROM domain_tasks ORDER BY updated_at DESC");
    if (rows.length === 0) return null;
    const all = rows.map((row) => JSON.parse(row.data) as Task);
    return {
      tasks: all.filter((task) => !task.completedAt),
      completed: all.filter((task) => Boolean(task.completedAt)),
    };
  }

  syncSnapshot(tasks: Task[], completed: Task[]): void {
    const desired = [...tasks, ...completed];
    this.queue = this.queue.then(() => queueDomainWrite(async (db) => {
      const rows = await db.select<DataRow[]>("SELECT id, data FROM domain_tasks");
      const existing = new Map(rows.map((row) => [row.id, row.data]));
      const desiredIds = new Set(desired.map((task) => task.id));
      await db.execute("BEGIN IMMEDIATE");
      try {
        for (const row of rows) {
          if (!desiredIds.has(row.id)) await db.execute("DELETE FROM domain_tasks WHERE id = $1", [row.id]);
        }
        for (const task of desired) {
          const data = JSON.stringify(task);
          if (existing.get(task.id) === data) continue;
          await db.execute(
            `INSERT OR REPLACE INTO domain_tasks(id, completed_at, due_date, updated_at, data)
             VALUES ($1, $2, $3, $4, $5)`,
            [task.id, task.completedAt ?? null, task.dueDate ?? null, Date.now(), data],
          );
        }
        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK").catch(() => undefined);
        throw error;
      }
    })).catch((error) => console.error("Task repository sync failed", error));
  }
}

class JournalRepository {
  private queue: Promise<void> = Promise.resolve();

  async load(): Promise<JournalEntry[] | null> {
    const db = await getDomainDatabase();
    if (!db) return null;
    const rows = await db.select<DataRow[]>("SELECT id, data FROM domain_journal ORDER BY updated_at DESC");
    if (rows.length === 0) return null;
    return rows.map((row) => JSON.parse(row.data) as JournalEntry);
  }

  syncSnapshot(entries: JournalEntry[]): void {
    this.queue = this.queue.then(() => queueDomainWrite(async (db) => {
      const rows = await db.select<DataRow[]>("SELECT id, data FROM domain_journal");
      const existing = new Map(rows.map((row) => [row.id, row.data]));
      const desiredIds = new Set(entries.map((entry) => entry.id));
      await db.execute("BEGIN IMMEDIATE");
      try {
        for (const row of rows) {
          if (!desiredIds.has(row.id)) await db.execute("DELETE FROM domain_journal WHERE id = $1", [row.id]);
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
    })).catch((error) => console.error("Journal repository sync failed", error));
  }

  upsert(entry: JournalEntry): void {
    this.queue = this.queue.then(() => queueDomainWrite(async (db) => {
      await db.execute(
        `INSERT OR REPLACE INTO domain_journal(id, entry_date, is_daily, updated_at, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.id, entry.date, entry.isDaily ? 1 : 0, entry.updatedAt ?? Date.now(), JSON.stringify(entry)],
      );
    })).catch((error) => console.error("Journal repository upsert failed", error));
  }

  delete(id: string): void {
    this.queue = this.queue.then(() => queueDomainWrite(async (db) => {
      await db.execute("DELETE FROM domain_journal WHERE id = $1", [id]);
    })).catch((error) => console.error("Journal repository delete failed", error));
  }
}

export const taskRepository = new TaskRepository();
export const journalRepository = new JournalRepository();

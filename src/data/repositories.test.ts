import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Task, JournalEntry } from "../types";
import {
  taskRepository,
  journalRepository,
  stickyNoteRepository,
  countdownRepository,
  timeBlockRepository,
} from "./repositories";
import { setDatabaseOverrideForTesting } from "./domainDatabase";

describe("Repositories (Tasks, Journal, and P0 Entities)", () => {
  let mockTables: Record<string, any[]> = {};

  beforeEach(() => {
    mockTables = {
      tasks: [],
      journal_entries: [],
      sticky_notes: [],
      countdowns: [],
      timeblocks: [],
      habits: [],
      pomodoro_logs: [],
    };

    const mockDb = {
      select: vi.fn(async (sql: string, _params?: any[]) => {
        if (sql.includes("FROM tasks")) return mockTables.tasks;
        if (sql.includes("FROM journal_entries")) return mockTables.journal_entries;
        if (sql.includes("FROM sticky_notes")) return mockTables.sticky_notes;
        if (sql.includes("FROM countdowns")) return mockTables.countdowns;
        if (sql.includes("FROM timeblocks")) return mockTables.timeblocks;
        return [];
      }),
      execute: vi.fn(async (sql: string, params?: any[]) => {
        if (sql.includes("INSERT OR REPLACE INTO tasks")) {
          mockTables.tasks = mockTables.tasks.filter((t) => t.id !== params?.[0]);
          mockTables.tasks.push({
            id: params?.[0],
            title: params?.[1],
            category: params?.[4],
            data: params?.[26],
            updated_at: params?.[27],
          });
        } else if (sql.includes("INSERT OR REPLACE INTO journal_entries")) {
          mockTables.journal_entries = mockTables.journal_entries.filter((j) => j.id !== params?.[0]);
          mockTables.journal_entries.push({
            id: params?.[0],
            link_key: params?.[1],
            title: params?.[2],
            body: params?.[3],
            entry_date: params?.[4],
            is_daily: params?.[5],
            data: params?.[13],
            created_at: params?.[14],
            updated_at: params?.[15],
          });
        } else if (sql.includes("DELETE FROM tasks")) {
          mockTables.tasks = mockTables.tasks.filter((t) => t.id !== params?.[0]);
        } else if (sql.includes("DELETE FROM journal_entries")) {
          mockTables.journal_entries = mockTables.journal_entries.filter((j) => j.id !== params?.[0]);
        }
      }),
    };

    setDatabaseOverrideForTesting(mockDb as any);
  });

  afterEach(() => {
    setDatabaseOverrideForTesting(null);
  });

  describe("TaskRepository (tasks table)", () => {
    it("can sync active tasks and load them back", async () => {
      const sampleTasks: Task[] = [
        {
          id: "task_test_1",
          title: "体验纯数据库模式待办",
          category: "urgent-important",
          dueDate: "2026-10-25",
        },
      ];

      taskRepository.syncActive(sampleTasks);
      await new Promise((r) => setTimeout(r, 50));

      const loaded = await taskRepository.load();
      expect(loaded).not.toBeNull();
      expect(loaded?.tasks.length).toBe(1);
      expect(loaded?.tasks[0].id).toBe("task_test_1");
      expect(loaded?.tasks[0].title).toBe("体验纯数据库模式待办");
      expect(loaded?.tasks[0].category).toBe("urgent-important");
    });
  });

  describe("JournalRepository (journal_entries table)", () => {
    it("can upsert and load journal entries", async () => {
      const sampleEntry: JournalEntry = {
        id: "journal_test_1",
        linkKey: "2026-10-25",
        title: "2026-10-25 日记：纯数据库与架构演进",
        content: "今天完成手帐纯数据库迁移，P0 表落地！",
        date: "2026-10-25",
        isDaily: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      journalRepository.upsert(sampleEntry);
      await new Promise((r) => setTimeout(r, 50));

      const entries = await journalRepository.load();
      expect(entries).not.toBeNull();
      expect(entries?.length).toBe(1);
      expect(entries?.[0].id).toBe("journal_test_1");
      expect(entries?.[0].title).toBe("2026-10-25 日记：纯数据库与架构演进");
      expect(entries?.[0].content).toContain("今天完成手帐纯数据库迁移");
    });

    it("can delete journal entry", async () => {
      const sampleEntry: JournalEntry = {
        id: "journal_test_2",
        linkKey: "2026-10-25",
        title: "待删日记",
        content: "内容",
        date: "2026-10-25",
        isDaily: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      journalRepository.upsert(sampleEntry);
      await new Promise((r) => setTimeout(r, 50));

      journalRepository.delete("journal_test_2");
      await new Promise((r) => setTimeout(r, 50));

      const entries = await journalRepository.load();
      expect((entries || []).some((e) => e.id === "journal_test_2")).toBe(false);
    });
  });

  describe("Other P0 Repositories", () => {
    it("can load sticky notes, countdowns, and timeblocks", async () => {
      const notes = await stickyNoteRepository.load();
      expect(Array.isArray(notes)).toBe(true);

      const countdowns = await countdownRepository.load();
      expect(Array.isArray(countdowns)).toBe(true);

      const timeblocks = await timeBlockRepository.load();
      expect(Array.isArray(timeblocks)).toBe(true);
    });
  });
});

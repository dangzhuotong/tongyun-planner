import { describe, it, expect } from "vitest";
import { taskCompletedOn, pomodoroStatsOn, computeDailyReview } from "./dailyReview";
import type { Task, PomodoroLog, JournalEntry } from "../types";

describe("dailyReview utils", () => {
  describe("taskCompletedOn", () => {
    it("should return true when completedAt matches the specified date", () => {
      // 2026-07-20 10:00:00 UTC
      const ts = new Date(2026, 6, 20, 10, 0, 0).getTime();
      const task: Task = {
        id: "t1",
        title: "Test",
        category: "important-not-urgent",
        completedAt: ts,
        dueDate: "2026-07-19",
      };
      expect(taskCompletedOn(task, "2026-07-20")).toBe(true);
      expect(taskCompletedOn(task, "2026-07-19")).toBe(false);
    });

    it("should fall back to dueDate when completedAt is missing or non-positive", () => {
      const taskWithoutCompletedAt: Task = {
        id: "t2",
        title: "Test without timestamp",
        category: "urgent-important",
        dueDate: "2026-07-20",
      };
      expect(taskCompletedOn(taskWithoutCompletedAt, "2026-07-20")).toBe(true);
      expect(taskCompletedOn(taskWithoutCompletedAt, "2026-07-21")).toBe(false);

      const taskWithZeroCompletedAt: Task = {
        id: "t3",
        title: "Zero timestamp",
        category: "urgent-important",
        completedAt: 0,
        dueDate: "2026-07-20",
      };
      expect(taskCompletedOn(taskWithZeroCompletedAt, "2026-07-20")).toBe(true);
    });
  });

  describe("pomodoroStatsOn", () => {
    it("should calculate focus count and rounded minutes for the target date", () => {
      const date = "2026-07-20";
      const startOfDay = new Date(`${date}T00:00:00`).getTime();
      const logs: Pick<PomodoroLog, "timestamp" | "duration">[] = [
        { timestamp: startOfDay + 3600 * 1000, duration: 1500 }, // 25 min inside
        { timestamp: startOfDay + 7200 * 1000, duration: 1200 }, // 20 min inside
        { timestamp: startOfDay - 1000, duration: 1500 }, // prior day
        { timestamp: startOfDay + 24 * 3600 * 1000 + 1000, duration: 1500 }, // next day
      ];

      const stats = pomodoroStatsOn(logs, date);
      expect(stats.count).toBe(2);
      expect(stats.minutes).toBe(45); // (1500 + 1200) / 60 = 45 min
    });

    it("should return 0 when no logs fall on the target date", () => {
      const stats = pomodoroStatsOn([], "2026-07-20");
      expect(stats).toEqual({ count: 0, minutes: 0 });
    });
  });

  describe("computeDailyReview", () => {
    it("should aggregate completed tasks, due tasks, pomodoro stats, and journal preview", () => {
      const date = "2026-07-20";
      const tasks: Task[] = [
        { id: "1", title: "Task 1", category: "urgent-important", dueDate: date },
        { id: "2", title: "Task 2", category: "important-not-urgent", dueDate: "2026-07-21" },
      ];
      const completedTasks: Task[] = [
        {
          id: "c1",
          title: "Done 1",
          category: "urgent-important",
          completedAt: new Date(2026, 6, 20, 15, 0).getTime(),
        },
        {
          id: "c2",
          title: "Done yesterday",
          category: "important-not-urgent",
          completedAt: new Date(2026, 6, 19, 15, 0).getTime(),
        },
      ];
      const logs: Pick<PomodoroLog, "timestamp" | "duration">[] = [
        { timestamp: new Date(`${date}T10:00:00`).getTime(), duration: 1800 },
      ];
      const journal: JournalEntry[] = [
        {
          id: "j1",
          linkKey: date,
          title: date,
          content: "  Today was a great, highly productive and peaceful day for deep thinking.  ",
          date,
          isDaily: true,
          createdAt: 0,
          updatedAt: 0,
        },
      ];

      const review = computeDailyReview({
        date,
        tasks,
        completedTasks,
        pomodoroLogs: logs,
        journal,
      });

      expect(review.date).toBe(date);
      expect(review.completedCount).toBe(1);
      expect(review.openDueCount).toBe(1);
      expect(review.focusCount).toBe(1);
      expect(review.focusMinutes).toBe(30);
      expect(review.hasJournal).toBe(true);
      expect(review.journalPreview).toBe("Today was a great, highly productive and peacefu");
    });

    it("should handle empty journal properly", () => {
      const review = computeDailyReview({
        date: "2026-07-20",
        tasks: [],
        completedTasks: [],
        pomodoroLogs: [],
        journal: [],
      });

      expect(review.hasJournal).toBe(false);
      expect(review.journalPreview).toBe("");
    });
  });
});

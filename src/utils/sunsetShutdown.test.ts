import { describe, it, expect } from "vitest";
import {
  getTodayString,
  getTomorrowString,
  calculateSunsetStats,
  shouldPromptSunsetShutdown,
} from "./sunsetShutdown";
import type { Task, PomodoroLog } from "../types";

describe("sunsetShutdown utils", () => {
  describe("getTodayString", () => {
    it("should format date as YYYY-MM-DD with zero-padding", () => {
      const d = new Date(2026, 4, 3); // May 3, 2026
      expect(getTodayString(d)).toBe("2026-05-03");

      const dOct = new Date(2026, 9, 15); // October 15, 2026
      expect(getTodayString(dOct)).toBe("2026-10-15");
    });

    it("should return a valid date string when called with default argument", () => {
      const today = getTodayString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("getTomorrowString", () => {
    it("should return the next day string", () => {
      const d = new Date(2026, 4, 15);
      expect(getTomorrowString(d)).toBe("2026-05-16");
    });

    it("should roll over to next month and year correctly", () => {
      const monthEnd = new Date(2026, 4, 31); // May 31
      expect(getTomorrowString(monthEnd)).toBe("2026-06-01");

      const yearEnd = new Date(2026, 11, 31); // Dec 31
      expect(getTomorrowString(yearEnd)).toBe("2027-01-01");
    });

    it("should return a valid date string with default argument", () => {
      const tomorrow = getTomorrowString();
      expect(tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("calculateSunsetStats", () => {
    const todayStr = "2026-07-20";
    const startMs = new Date("2026-07-20T00:00:00").getTime();
    const midDayMs = new Date("2026-07-20T14:30:00").getTime();
    const endMs = new Date("2026-07-20T23:59:59.999").getTime();
    const yesterdayMs = new Date("2026-07-19T23:59:59").getTime();
    const tomorrowMs = new Date("2026-07-21T00:00:00").getTime();

    it("should count completed tasks finished within today", () => {
      const completedTasks: Task[] = [
        { id: "c1", title: "Task 1", category: "urgent-important", completedAt: startMs },
        { id: "c2", title: "Task 2", category: "urgent-important", completedAt: midDayMs },
        { id: "c3", title: "Task 3", category: "urgent-important", completedAt: endMs },
        { id: "c4", title: "Yesterday", category: "urgent-important", completedAt: yesterdayMs },
        { id: "c5", title: "Tomorrow", category: "urgent-important", completedAt: tomorrowMs },
        { id: "c6", title: "No timestamp", category: "urgent-important" },
      ];

      const stats = calculateSunsetStats([], completedTasks, [], todayStr);
      expect(stats.completedCount).toBe(3);
    });

    it("should sum focus minutes and log count for today's logs", () => {
      const pomodoroLogs: PomodoroLog[] = [
        { id: "p1", timestamp: startMs, duration: 25 },
        { id: "p2", timestamp: midDayMs, duration: 30 },
        { id: "p3", timestamp: endMs, duration: 15 },
        { id: "p4", timestamp: yesterdayMs, duration: 25 },
        { id: "p5", timestamp: tomorrowMs, duration: 25 },
        { id: "p6", timestamp: midDayMs, duration: 0 },
      ];

      const stats = calculateSunsetStats([], [], pomodoroLogs, todayStr);
      expect(stats.pomodoroCount).toBe(4);
      expect(stats.totalFocusMinutes).toBe(70); // 25 + 30 + 15 + 0
    });

    it("should include uncompleted tasks due today or earlier (overdue), excluding future and undated tasks", () => {
      const tasks: Task[] = [
        { id: "t1", title: "Overdue task", category: "urgent-important", dueDate: "2026-07-18" },
        { id: "t2", title: "Today task", category: "urgent-important", dueDate: "2026-07-20" },
        { id: "t3", title: "Future task", category: "important-not-urgent", dueDate: "2026-07-21" },
        { id: "t4", title: "Undated task", category: "not-urgent-not-important" },
        { id: "t5", title: "Empty due date", category: "urgent-not-important", dueDate: "" },
      ];

      const stats = calculateSunsetStats(tasks, [], [], todayStr);
      expect(stats.uncompletedTasks.map((t) => t.id)).toEqual(["t1", "t2"]);
    });

    it("should return zeroed statistics when all input arrays are empty", () => {
      const stats = calculateSunsetStats([], [], [], todayStr);
      expect(stats).toEqual({
        completedCount: 0,
        totalFocusMinutes: 0,
        pomodoroCount: 0,
        uncompletedTasks: [],
      });
    });
  });

  describe("shouldPromptSunsetShutdown", () => {
    const today = "2026-07-20";

    it("should return false when current hour is earlier than prompt hour", () => {
      const morning = new Date(2026, 6, 20, 10, 0, 0); // 10:00
      expect(shouldPromptSunsetShutdown(morning, null, 18)).toBe(false);

      const afternoon = new Date(2026, 6, 20, 17, 59, 0); // 17:59
      expect(shouldPromptSunsetShutdown(afternoon, null, 18)).toBe(false);
    });

    it("should return false if last shutdown was already completed today", () => {
      const evening = new Date(2026, 6, 20, 19, 0, 0); // 19:00
      expect(shouldPromptSunsetShutdown(evening, today, 18)).toBe(false);
    });

    it("should return true when current hour >= prompt hour and last shutdown was on a previous date", () => {
      const evening = new Date(2026, 6, 20, 18, 0, 0); // 18:00
      expect(shouldPromptSunsetShutdown(evening, "2026-07-19", 18)).toBe(true);
      expect(shouldPromptSunsetShutdown(evening, null, 18)).toBe(true);
    });

    it("should honor custom prompt hour", () => {
      const earlyEvening = new Date(2026, 6, 20, 17, 0, 0); // 17:00
      expect(shouldPromptSunsetShutdown(earlyEvening, null, 16)).toBe(true);
      expect(shouldPromptSunsetShutdown(earlyEvening, null, 18)).toBe(false);
    });
  });
});

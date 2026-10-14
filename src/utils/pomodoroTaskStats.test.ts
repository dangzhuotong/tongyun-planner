import { describe, it, expect } from "vitest";
import {
  getTaskPomodoroStats,
  getDailyTaskPomodoroSummaries,
  formatTaskPomodoroBadge,
} from "./pomodoroTaskStats";
import type { PomodoroLog } from "../types";

describe("pomodoroTaskStats utils", () => {
  describe("getTaskPomodoroStats", () => {
    it("should return zero stats for empty taskId or invalid logs", () => {
      expect(getTaskPomodoroStats("", [])).toEqual({ count: 0, minutes: 0 });
      expect(getTaskPomodoroStats("task-1", null as any)).toEqual({
        count: 0,
        minutes: 0,
      });
      expect(getTaskPomodoroStats("task-1", undefined as any)).toEqual({
        count: 0,
        minutes: 0,
      });
    });

    it("should correctly sum count and duration for matching taskId", () => {
      const logs: Pick<PomodoroLog, "taskId" | "duration">[] = [
        { taskId: "task-1", duration: 1500 }, // 25 min
        { taskId: "task-2", duration: 1200 }, // 20 min (different task)
        { taskId: "task-1", duration: 1800 }, // 30 min
        { taskId: undefined, duration: 1500 }, // untracked
      ];

      const stats = getTaskPomodoroStats("task-1", logs);
      expect(stats.count).toBe(2);
      expect(stats.minutes).toBe(55); // (1500 + 1800) / 60 = 55 min
    });

    it("should round total minutes to nearest whole minute", () => {
      const logs: Pick<PomodoroLog, "taskId" | "duration">[] = [
        { taskId: "task-1", duration: 80 }, // 1.33 min -> 1 min
      ];
      expect(getTaskPomodoroStats("task-1", logs).minutes).toBe(1);

      const logs2: Pick<PomodoroLog, "taskId" | "duration">[] = [
        { taskId: "task-1", duration: 100 }, // 1.67 min -> 2 min
      ];
      expect(getTaskPomodoroStats("task-1", logs2).minutes).toBe(2);
    });

    it("should handle logs with missing or zero duration", () => {
      const logs: Pick<PomodoroLog, "taskId" | "duration">[] = [
        { taskId: "task-1", duration: 0 },
        { taskId: "task-1", duration: undefined as any },
      ];
      const stats = getTaskPomodoroStats("task-1", logs);
      expect(stats.count).toBe(2);
      expect(stats.minutes).toBe(0);
    });
  });

  describe("getDailyTaskPomodoroSummaries", () => {
    it("should return empty array for empty date or invalid logs", () => {
      expect(getDailyTaskPomodoroSummaries("", [])).toEqual([]);
      expect(getDailyTaskPomodoroSummaries("2026-10-15", null as any)).toEqual([]);
    });

    it("should aggregate logs by task on the target date", () => {
      const targetDate = "2026-10-15";
      const startOfDay = new Date(2026, 9, 15, 10, 0, 0).getTime();
      const nextDay = new Date(2026, 9, 16, 10, 0, 0).getTime();

      const logs: Pick<PomodoroLog, "timestamp" | "duration" | "taskId" | "taskTitle">[] = [
        {
          timestamp: startOfDay,
          duration: 1500,
          taskId: "t1",
          taskTitle: "Design Mockups",
        },
        {
          timestamp: startOfDay + 3600 * 1000,
          duration: 1500,
          taskId: "t1",
          taskTitle: "Design Mockups",
        },
        {
          timestamp: startOfDay + 7200 * 1000,
          duration: 1200,
          taskId: "t2",
          taskTitle: "Code Review",
        },
        {
          timestamp: nextDay, // Should be excluded (different day)
          duration: 1500,
          taskId: "t1",
          taskTitle: "Design Mockups",
        },
      ];

      const summaries = getDailyTaskPomodoroSummaries(targetDate, logs);
      expect(summaries.length).toBe(2);

      const t1Summary = summaries.find((s) => s.taskId === "t1");
      expect(t1Summary).toBeDefined();
      expect(t1Summary?.taskTitle).toBe("Design Mockups");
      expect(t1Summary?.count).toBe(2);
      expect(t1Summary?.minutes).toBe(50); // (1500 + 1500) / 60

      const t2Summary = summaries.find((s) => s.taskId === "t2");
      expect(t2Summary).toBeDefined();
      expect(t2Summary?.taskTitle).toBe("Code Review");
      expect(t2Summary?.count).toBe(1);
      expect(t2Summary?.minutes).toBe(20);
    });

    it("should group untracked sessions without taskId", () => {
      const targetDate = "2026-10-15";
      const ts = new Date(2026, 9, 15, 14, 0, 0).getTime();

      const logs: Pick<PomodoroLog, "timestamp" | "duration" | "taskId" | "taskTitle">[] = [
        {
          timestamp: ts,
          duration: 1500,
          taskId: undefined,
          taskTitle: "Reading Book",
        },
        {
          timestamp: ts + 3600 * 1000,
          duration: 1800,
          taskId: undefined,
          taskTitle: "Reading Book",
        },
        {
          timestamp: ts + 7200 * 1000,
          duration: 600,
          taskId: undefined,
          taskTitle: "", // Missing title falls back to "自由专注"
        },
      ];

      const summaries = getDailyTaskPomodoroSummaries(targetDate, logs);
      expect(summaries.length).toBe(2);

      const reading = summaries.find((s) => s.taskTitle === "Reading Book");
      expect(reading?.count).toBe(2);
      expect(reading?.minutes).toBe(55);

      const free = summaries.find((s) => s.taskTitle === "自由专注");
      expect(free?.count).toBe(1);
      expect(free?.minutes).toBe(10);
    });
  });

  describe("formatTaskPomodoroBadge", () => {
    it("should format count and estimated when estimated is greater than 0", () => {
      expect(formatTaskPomodoroBadge(2, 4)).toBe("2/4");
      expect(formatTaskPomodoroBadge(0, 3)).toBe("0/3");
      expect(formatTaskPomodoroBadge(5, 5)).toBe("5/5");
      expect(formatTaskPomodoroBadge(6, 4)).toBe("6/4");
    });

    it("should show count only when estimated is undefined, zero, or negative", () => {
      expect(formatTaskPomodoroBadge(3, undefined)).toBe("3");
      expect(formatTaskPomodoroBadge(3, 0)).toBe("3");
      expect(formatTaskPomodoroBadge(3, -1)).toBe("3");
    });

    it("should return empty string when count is 0 and no valid estimate", () => {
      expect(formatTaskPomodoroBadge(0)).toBe("");
      expect(formatTaskPomodoroBadge(0, undefined)).toBe("");
      expect(formatTaskPomodoroBadge(0, 0)).toBe("");
    });
  });
});

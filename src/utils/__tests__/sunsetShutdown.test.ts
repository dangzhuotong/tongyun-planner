import { describe, expect, it } from "vitest";
import {
  calculateSunsetStats,
  getTodayString,
  getTomorrowString,
  shouldPromptSunsetShutdown,
} from "../sunsetShutdown";
import type { Task, PomodoroLog } from "../../types";

describe("sunsetShutdown utility", () => {
  it("formats today and tomorrow dates consistently", () => {
    const d = new Date(2026, 9, 15); // 2026-10-15
    expect(getTodayString(d)).toBe("2026-10-15");
    expect(getTomorrowString(d)).toBe("2026-10-16");
  });

  it("calculates sunset stats accurately for today", () => {
    const today = "2026-10-15";
    const start = new Date(`${today}T08:00:00`).getTime();
    const yesterday = new Date(`2026-10-14T10:00:00`).getTime();

    const tasks: Task[] = [
      { id: "t1", title: "未完成任务1", category: "urgent-important", dueDate: today },
      { id: "t2", title: "明天到期任务", category: "important-not-urgent", dueDate: "2026-10-16" },
      { id: "t3", title: "逾期任务", category: "urgent-important", dueDate: "2026-10-10" },
    ];

    const completedTasks: Task[] = [
      { id: "c1", title: "今日完成", category: "urgent-important", completedAt: start },
      { id: "c2", title: "昨日完成", category: "urgent-important", completedAt: yesterday },
    ];

    const pomodoroLogs: PomodoroLog[] = [
      { id: "p1", timestamp: start, duration: 25 },
      { id: "p2", timestamp: start + 3600000, duration: 30 },
      { id: "p3", timestamp: yesterday, duration: 25 },
    ];

    const stats = calculateSunsetStats(tasks, completedTasks, pomodoroLogs, today);

    expect(stats.completedCount).toBe(1);
    expect(stats.totalFocusMinutes).toBe(55);
    expect(stats.pomodoroCount).toBe(2);
    // t1 (今日到期) 和 t3 (更早逾期) 均纳入今日未完成清点
    expect(stats.uncompletedTasks.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("checks whether sunset prompt should appear after 18:00 and not repeated today", () => {
    const at5pm = new Date(2026, 9, 15, 17, 30);
    const at7pm = new Date(2026, 9, 15, 19, 0);

    expect(shouldPromptSunsetShutdown(at5pm, null, 18)).toBe(false);
    expect(shouldPromptSunsetShutdown(at7pm, null, 18)).toBe(true);
    expect(shouldPromptSunsetShutdown(at7pm, "2026-10-15", 18)).toBe(false);
    expect(shouldPromptSunsetShutdown(at7pm, "2026-10-14", 18)).toBe(true);
  });
});

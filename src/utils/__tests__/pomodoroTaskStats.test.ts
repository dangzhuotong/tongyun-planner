import { describe, it, expect } from "vitest";
import {
  getTaskPomodoroStats,
  getDailyTaskPomodoroSummaries,
  formatTaskPomodoroBadge,
} from "../pomodoroTaskStats";
import type { PomodoroLog } from "../../types";

describe("pomodoroTaskStats", () => {
  const mockLogs: PomodoroLog[] = [
    {
      id: "log-1",
      timestamp: new Date("2026-10-14T09:00:00").getTime(),
      duration: 1500, // 25 min
      taskId: "task-a",
      taskTitle: "写方案",
    },
    {
      id: "log-2",
      timestamp: new Date("2026-10-14T10:00:00").getTime(),
      duration: 1500, // 25 min
      taskId: "task-a",
      taskTitle: "写方案",
    },
    {
      id: "log-3",
      timestamp: new Date("2026-10-14T11:00:00").getTime(),
      duration: 1800, // 30 min
      taskId: "task-b",
      taskTitle: "代码重构",
    },
    {
      id: "log-4",
      timestamp: new Date("2026-10-13T15:00:00").getTime(), // 前一天
      duration: 1500, // 25 min
      taskId: "task-a",
      taskTitle: "写方案",
    },
    {
      id: "log-5",
      timestamp: new Date("2026-10-14T14:00:00").getTime(),
      duration: 1200, // 20 min
      // 无任务
    },
  ];

  it("calculates total pomodoros and minutes for a specific task", () => {
    const statsA = getTaskPomodoroStats("task-a", mockLogs);
    expect(statsA.count).toBe(3);
    expect(statsA.minutes).toBe(75); // 25 + 25 + 25 = 75

    const statsB = getTaskPomodoroStats("task-b", mockLogs);
    expect(statsB.count).toBe(1);
    expect(statsB.minutes).toBe(30);

    const statsNonExistent = getTaskPomodoroStats("non-existent", mockLogs);
    expect(statsNonExistent.count).toBe(0);
    expect(statsNonExistent.minutes).toBe(0);
  });

  it("aggregates daily pomodoro summaries grouped by task", () => {
    const summaries = getDailyTaskPomodoroSummaries("2026-10-14", mockLogs);
    expect(summaries).toHaveLength(3); // task-a, task-b, and untracked focus

    const taskASummary = summaries.find((s) => s.taskId === "task-a");
    expect(taskASummary).toBeDefined();
    expect(taskASummary?.count).toBe(2);
    expect(taskASummary?.minutes).toBe(50);
    expect(taskASummary?.taskTitle).toBe("写方案");

    const taskBSummary = summaries.find((s) => s.taskId === "task-b");
    expect(taskBSummary?.count).toBe(1);
    expect(taskBSummary?.minutes).toBe(30);

    const untracked = summaries.find((s) => !s.taskId);
    expect(untracked?.count).toBe(1);
    expect(untracked?.minutes).toBe(20);
  });

  it("formats task pomodoro badge with or without estimated count", () => {
    expect(formatTaskPomodoroBadge(2)).toBe("2");
    expect(formatTaskPomodoroBadge(2, 4)).toBe("2/4");
    expect(formatTaskPomodoroBadge(0, 3)).toBe("0/3");
    expect(formatTaskPomodoroBadge(0)).toBe("");
  });
});

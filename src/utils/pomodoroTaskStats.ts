import type { PomodoroLog } from "../types";
import { getLocalDateString } from "./date";

export interface TaskPomodoroStats {
  count: number;
  minutes: number;
}

export interface DailyTaskPomodoroSummary {
  taskId?: string;
  taskTitle: string;
  count: number;
  minutes: number;
}

/**
 * 统计特定任务在所有历史日志中累计的番茄个数与专注分钟数
 */
export function getTaskPomodoroStats(
  taskId: string,
  logs: Pick<PomodoroLog, "taskId" | "duration">[],
): TaskPomodoroStats {
  if (!taskId || !Array.isArray(logs)) {
    return { count: 0, minutes: 0 };
  }

  let count = 0;
  let totalSeconds = 0;

  for (const log of logs) {
    if (log.taskId === taskId) {
      count += 1;
      totalSeconds += log.duration || 0;
    }
  }

  return {
    count,
    minutes: Math.round(totalSeconds / 60),
  };
}

/**
 * 按日期聚合该日专注记录，并按任务分组统计
 */
export function getDailyTaskPomodoroSummaries(
  date: string,
  logs: Pick<PomodoroLog, "timestamp" | "duration" | "taskId" | "taskTitle">[],
): DailyTaskPomodoroSummary[] {
  if (!date || !Array.isArray(logs)) return [];

  const map = new Map<
    string,
    { taskId?: string; taskTitle: string; count: number; totalSeconds: number }
  >();

  for (const log of logs) {
    const logDate = getLocalDateString(new Date(log.timestamp));
    if (logDate !== date) continue;

    const groupKey = log.taskId ? `task:${log.taskId}` : `untracked:${log.taskTitle || "独立专注"}`;
    const existing = map.get(groupKey);

    const title = log.taskTitle?.trim() || (log.taskId ? "未命名任务" : "自由专注");
    const duration = log.duration || 0;

    if (existing) {
      existing.count += 1;
      existing.totalSeconds += duration;
      if (!existing.taskTitle && title) {
        existing.taskTitle = title;
      }
    } else {
      map.set(groupKey, {
        taskId: log.taskId,
        taskTitle: title,
        count: 1,
        totalSeconds: duration,
      });
    }
  }

  return Array.from(map.values()).map((item) => ({
    taskId: item.taskId,
    taskTitle: item.taskTitle,
    count: item.count,
    minutes: Math.round(item.totalSeconds / 60),
  }));
}

/**
 * 格式化任务卡片上番茄徽章的文案
 * 如: 2 -> "2", 2 / 4 -> "2/4", 0 / 3 -> "0/3", 0 / 无 -> ""
 */
export function formatTaskPomodoroBadge(count: number, estimated?: number): string {
  if (typeof estimated === "number" && estimated > 0) {
    return `${count}/${estimated}`;
  }
  return count > 0 ? `${count}` : "";
}

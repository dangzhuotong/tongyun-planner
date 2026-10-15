import type { Task, PomodoroLog } from "../types";

export interface SunsetStats {
  completedCount: number;
  totalFocusMinutes: number;
  pomodoroCount: number;
  uncompletedTasks: Task[];
}

/** 获取今天的 YYYY-MM-DD 字符串 */
export function getTodayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 获取明天的 YYYY-MM-DD 字符串 */
export function getTomorrowString(d: Date = new Date()): string {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return getTodayString(next);
}

/** 计算今日日落离线所需的统计数据 */
export function calculateSunsetStats(
  tasks: Task[],
  completedTasks: Task[],
  pomodoroLogs: PomodoroLog[],
  todayStr: string = getTodayString(),
): SunsetStats {
  const startOfDay = new Date(`${todayStr}T00:00:00`).getTime();
  const endOfDay = new Date(`${todayStr}T23:59:59.999`).getTime();

  // 今日完成的任务
  const completedToday = completedTasks.filter((t) => {
    if (!t.completedAt) return false;
    return t.completedAt >= startOfDay && t.completedAt <= endOfDay;
  });

  // 今日番茄专注时长
  const todayLogs = pomodoroLogs.filter((l) => {
    return l.timestamp >= startOfDay && l.timestamp <= endOfDay;
  });

  const totalFocusMinutes = todayLogs.reduce((acc, curr) => acc + (curr.duration || 0), 0);

  // 今日截止但仍未完成的任务（包括更早前逾期的任务）
  const uncompletedTasks = tasks.filter((t) => {
    if (!t.dueDate) return false;
    return t.dueDate <= todayStr;
  });

  return {
    completedCount: completedToday.length,
    totalFocusMinutes,
    pomodoroCount: todayLogs.length,
    uncompletedTasks,
  };
}

/** 判断当前时间是否应该提示日落离线（默认傍晚 18:00 之后，且今天尚未点击过离线） */
export function shouldPromptSunsetShutdown(
  now: Date = new Date(),
  lastShutdownDate: string | null = null,
  promptHour: number = 18,
): boolean {
  const currentHour = now.getHours();
  if (currentHour < promptHour) return false;
  const today = getTodayString(now);
  if (lastShutdownDate === today) return false;
  return true;
}

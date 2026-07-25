import type { JournalEntry, PomodoroLog, Task } from "../types";
import { getLocalDateString } from "./date";

/** 任务是否在某日完成：优先 completedAt，旧数据回退 dueDate */
export function taskCompletedOn(task: Task, date: string): boolean {
  if (typeof task.completedAt === "number" && task.completedAt > 0) {
    return getLocalDateString(new Date(task.completedAt)) === date;
  }
  return task.dueDate === date;
}

export function pomodoroStatsOn(
  logs: Pick<PomodoroLog, "timestamp" | "duration">[],
  date: string
): { count: number; minutes: number } {
  const start = new Date(`${date}T00:00:00`).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  let count = 0;
  let seconds = 0;
  for (const log of logs) {
    if (log.timestamp < start || log.timestamp >= end) continue;
    count += 1;
    seconds += log.duration || 0;
  }
  return { count, minutes: Math.round(seconds / 60) };
}

export interface DailyReviewStats {
  date: string;
  completedCount: number;
  openDueCount: number;
  focusMinutes: number;
  focusCount: number;
  hasJournal: boolean;
  journalPreview: string;
}

export function computeDailyReview(input: {
  date: string;
  tasks: Task[];
  completedTasks: Task[];
  pomodoroLogs: Pick<PomodoroLog, "timestamp" | "duration">[];
  journal: JournalEntry[];
}): DailyReviewStats {
  const { date, tasks, completedTasks, pomodoroLogs, journal } = input;
  const focus = pomodoroStatsOn(pomodoroLogs, date);
  const entry = journal.find((e) => e.isDaily && (e.linkKey === date || e.date === date));
  const preview = (entry?.content || "").trim();

  return {
    date,
    completedCount: completedTasks.filter((t) => taskCompletedOn(t, date)).length,
    openDueCount: tasks.filter((t) => t.dueDate === date).length,
    focusMinutes: focus.minutes,
    focusCount: focus.count,
    hasJournal: preview.length > 0,
    journalPreview: preview.slice(0, 48),
  };
}

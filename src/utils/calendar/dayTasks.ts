import type { Task } from "../../types";

/** 日历右侧面板当日的任务分组。 */
export interface DayTaskGroups {
  /** 未完成，沿用列表原有顺序，面板不做二次排序。 */
  pending: Task[];
  /** 已完成，按完成时间从早到晚。 */
  completed: Task[];
  /** 当天既无未完成也无已完成，才允许展示空状态插画。 */
  hasAny: boolean;
}

/**
 * 按任务日期（dueDate）分组，没有 dueDate 的任务不属于任何一天。
 *
 * 已完成任务的归属口径是 **任务日期**，不是完成时间：11 月 2 日到期的任务在
 * 11 月 3 日勾完，仍然只出现在 11 月 2 日的面板里。这样勾选与撤销只会在同一天
 * 的两个分组之间移动，不会让任务跳到别的日期。
 */
export function groupTasksByDueDate(tasks: Task[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {};
  const list = Array.isArray(tasks) ? tasks : [];
  for (const task of list) {
    if (!task.dueDate) continue;
    if (!map[task.dueDate]) {
      map[task.dueDate] = [];
    }
    map[task.dueDate].push(task);
  }
  return map;
}

/** 缺失 completedAt 的历史数据按最早处理，同一时刻再按标题保证顺序稳定。 */
function compareCompleted(a: Task, b: Task): number {
  const byTime = (a.completedAt ?? 0) - (b.completedAt ?? 0);
  if (byTime !== 0) return byTime;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

export function splitDayTasks(
  pendingByDueDate: Record<string, Task[]>,
  completedByDueDate: Record<string, Task[]>,
  dateStr: string,
): DayTaskGroups {
  const pending = pendingByDueDate[dateStr] || [];
  const completed = [...(completedByDueDate[dateStr] || [])].sort(compareCompleted);
  return { pending, completed, hasAny: pending.length > 0 || completed.length > 0 };
}

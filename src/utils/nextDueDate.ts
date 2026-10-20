import { addLocalDays, addLocalMonths, parseLocalDate } from "./date";
import { getNextRRuleDate } from "./rrule";

export interface RepeatingDueFields {
  dueDate?: string;
  repeat?: string;
  repeatAnchorDay?: number;
}

export function isRepeatAnchorDay(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31;
}

export function dayOfMonth(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const parsed = parseLocalDate(dateStr);
  if (!parsed) return undefined;
  const day = parsed.getDate();
  return isRepeatAnchorDay(day) ? day : undefined;
}

/** 没有锚定日时，用当前到期日的日。无效锚定日同样回退。 */
export function resolveMonthlyAnchorDay(
  currentDue: string | undefined,
  anchorDay?: number,
): number | undefined {
  if (isRepeatAnchorDay(anchorDay)) return anchorDay;
  return dayOfMonth(currentDue);
}

export function getNextDueDate(
  currentDue: string | undefined,
  repeat: string,
  anchorDay?: number,
): string | undefined {
  if (!repeat || repeat === "none") return undefined;
  if (repeat === "daily") return addLocalDays(currentDue, 1);
  if (repeat === "weekly") return addLocalDays(currentDue, 7);
  if (repeat === "monthly") {
    return addLocalMonths(currentDue, 1, resolveMonthlyAnchorDay(currentDue, anchorDay));
  }
  return getNextRRuleDate(currentDue!, repeat);
}

/** 下一次重复：每月任务带上锚定日，避免 1/31 → 2/28 之后漂到 3/28。 */
export function nextRepeatingDue(task: RepeatingDueFields): {
  dueDate: string | undefined;
  repeatAnchorDay?: number;
} {
  const repeat = task.repeat ?? "none";
  if (repeat !== "monthly") {
    return { dueDate: getNextDueDate(task.dueDate, repeat) };
  }
  const repeatAnchorDay = resolveMonthlyAnchorDay(task.dueDate, task.repeatAnchorDay);
  return {
    dueDate: getNextDueDate(task.dueDate, repeat, repeatAnchorDay),
    repeatAnchorDay,
  };
}

/** 新建每月任务时记下原始日。已有合法锚定日则保持不变。 */
export function withMonthlyAnchor<T extends RepeatingDueFields>(
  task: T,
): T & { repeatAnchorDay?: number } {
  if (task.repeat !== "monthly") return task;
  if (isRepeatAnchorDay(task.repeatAnchorDay)) return task;
  const day = dayOfMonth(task.dueDate);
  if (day == null) return task;
  return { ...task, repeatAnchorDay: day };
}

/**
 * 导入/同步落盘前的兜底清理：非 monthly 或非法锚定日不保留。
 * 合法且仍在 monthly 的锚定日原样保留，避免 2/28 把 31 改成 28。
 */
export function sanitizeRepeatAnchor<T extends RepeatingDueFields>(task: T): T {
  if (task.repeat === "monthly" && isRepeatAnchorDay(task.repeatAnchorDay)) return task;
  if (!("repeatAnchorDay" in task)) return task;
  const next = { ...task };
  delete next.repeatAnchorDay;
  return next;
}

/** 批量清理；没有脏字段时返回原数组，避免无意义重渲染。 */
export function sanitizeRepeatAnchors<T extends RepeatingDueFields>(tasks: T[]): T[] {
  if (!Array.isArray(tasks)) return tasks;
  let changed = false;
  const next = tasks.map((task) => {
    if (!task || typeof task !== "object") return task;
    const cleaned = sanitizeRepeatAnchor(task);
    if (cleaned !== task) changed = true;
    return cleaned;
  });
  return changed ? next : tasks;
}

/**
 * 用户改了到期日或重复规则时，锚定日跟着新的到期日走。
 * 离开 monthly 时清掉锚定日；再改回 monthly 时按当前到期日重算，不用离开前的 31。
 * 完成任务生成下一次时不走这里，所以 2 月 28 日不会把锚定日改成 28。
 */
export function applyDueAnchor<T extends RepeatingDueFields>(task: T, updates: Partial<T>): T {
  const next: T = { ...task, ...updates };
  if (next.repeat !== "monthly") {
    delete next.repeatAnchorDay;
    return next;
  }
  if ("repeatAnchorDay" in updates) return next;

  const switchingToMonthly = "repeat" in updates && task.repeat !== "monthly";
  if (switchingToMonthly || "dueDate" in updates) {
    const day = dayOfMonth(next.dueDate);
    if (day == null) {
      delete next.repeatAnchorDay;
      return next;
    }
    return { ...next, repeatAnchorDay: day };
  }

  if ("repeat" in updates && !isRepeatAnchorDay(next.repeatAnchorDay)) {
    const day = dayOfMonth(next.dueDate);
    if (day != null) return { ...next, repeatAnchorDay: day };
  }
  return next;
}

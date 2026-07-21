export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split("-").map((part) => parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;

  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function addLocalDays(dateStr: string | undefined, days: number): string {
  const date = dateStr ? parseLocalDate(dateStr) : new Date();
  const next = date || new Date();
  next.setDate(next.getDate() + days);

  return getLocalDateString(next);
}

export function addLocalMonths(dateStr: string | undefined, months: number): string {
  const date = dateStr ? parseLocalDate(dateStr) : new Date();
  const next = date || new Date();
  next.setMonth(next.getMonth() + months);

  return getLocalDateString(next);
}

/** 首页/心流要露出的任务：今日到期、已逾期、或未设日期（不含纯未来） */
export type HomeTaskKind = "overdue" | "today" | "undated";

export function getHomeTaskKind(task: { dueDate?: string }, today: string): HomeTaskKind | null {
  if (!task.dueDate) return "undated";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  return null;
}

const QUAD_ORDER = [
  "urgent-important",
  "important-not-urgent",
  "urgent-not-important",
  "not-urgent-not-important",
] as const;

export function filterHomeActionableTasks<T extends { dueDate?: string; isPinned?: boolean; category?: string }>(
  tasks: T[],
  today: string
): T[] {
  const kindRank: Record<HomeTaskKind, number> = { overdue: 0, today: 1, undated: 2 };
  return tasks
    .filter((t) => getHomeTaskKind(t, today) !== null)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const ka = getHomeTaskKind(a, today)!;
      const kb = getHomeTaskKind(b, today)!;
      if (kindRank[ka] !== kindRank[kb]) return kindRank[ka] - kindRank[kb];
      const qa = QUAD_ORDER.indexOf((a.category || "important-not-urgent") as typeof QUAD_ORDER[number]);
      const qb = QUAD_ORDER.indexOf((b.category || "important-not-urgent") as typeof QUAD_ORDER[number]);
      return (qa < 0 ? 99 : qa) - (qb < 0 ? 99 : qb);
    });
}

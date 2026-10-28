const STORAGE_KEY = "tongyun_dismissed_journal_todos";

function read(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function write(keys: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
}

/** 用户删掉「日记 2026-10-25」这类自动待办后，记下日记 id 和日期，避免同步再生成。 */
export function dismissJournalTodo(task: {
  journalId?: string;
  title: string;
  tags?: string[];
}): void {
  const keys = dismissalKeys(task);
  if (keys.length === 0) return;
  const next = read();
  for (const key of keys) next.add(key);
  write(next);
}

export function restoreJournalTodo(task: {
  journalId?: string;
  title: string;
  tags?: string[];
}): void {
  const keys = dismissalKeys(task);
  if (keys.length === 0) return;
  const next = read();
  for (const key of keys) next.delete(key);
  write(next);
}

export function isJournalTodoDismissed(entryId: string, date: string): boolean {
  const keys = read();
  return keys.has(entryId) || keys.has(`date:${date}`);
}

export function clearDismissedJournalTodos(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

function dismissalKeys(task: { journalId?: string; title: string; tags?: string[] }): string[] {
  const date = /^日记 (\d{4}-\d{2}-\d{2})$/.exec(task.title)?.[1];
  const generated = Boolean(task.journalId) || Boolean(date && task.tags?.includes("日记"));
  if (!generated) return [];
  const keys: string[] = [];
  if (task.journalId) keys.push(task.journalId);
  if (date) keys.push(`date:${date}`);
  return keys;
}

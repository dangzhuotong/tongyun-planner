import type { Task } from "../types";
import { nextRepeatingDue } from "./nextDueDate";

export interface TaskCompletion {
  completed: Task;
  successor?: Task;
}

function fingerprint(task: Task): string {
  const { updatedAt: _updatedAt, ...content } = task;
  // SQLite materializes these defaults when loading a row. They are not edits.
  const normalized = {
    ...content,
    priority: task.priority ?? "medium",
    isFavorite: task.isFavorite ?? false,
    isPinned: task.isPinned ?? false,
    assigneeKind: task.assigneeKind ?? "human",
    subtasks: task.subtasks ?? [],
    tags: task.tags ?? [],
    dependsOn: task.dependsOn ?? [],
    attachments: task.attachments ?? [],
  };
  return JSON.stringify(normalized, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
}

export function completeTask(task: Task, now = Date.now()): TaskCompletion {
  const completedAt = Math.max(now, (task.reopenedAt ?? 0) + 1);
  const completed: Task = { ...task, completedAt, updatedAt: completedAt };
  delete completed.reopenedAt;
  delete completed.repeatSuccessor;
  if (!task.repeat || task.repeat === "none") return { completed };

  const next = nextRepeatingDue(task);
  const seriesId = task.repeatSeriesId || task.id;
  const successor: Task = {
    ...task,
    id: `${seriesId}::repeat::${next.dueDate ?? now}`,
    dueDate: next.dueDate,
    repeatSeriesId: seriesId,
    updatedAt: now,
  };
  delete successor.completedAt;
  delete successor.reopenedAt;
  delete successor.repeatSuccessor;
  if (next.repeatAnchorDay != null) successor.repeatAnchorDay = next.repeatAnchorDay;
  else delete successor.repeatAnchorDay;
  completed.repeatSuccessor = { id: successor.id, snapshot: fingerprint(successor) };
  return { completed, successor };
}

/** Only retract the generated occurrence if the user has not changed it. */
export function undoTaskCompletion(completed: Task, tasks: Task[]): Task[] {
  const reopenedAt = Math.max(Date.now(), completed.completedAt ?? 0);
  const restored = { ...completed, updatedAt: reopenedAt, reopenedAt };
  delete restored.completedAt;
  delete restored.repeatSuccessor;
  return [
    restored,
    ...tasks.filter((task) => {
      if (task.id === completed.id) return false;
      const generated = completed.repeatSuccessor;
      return !generated || task.id !== generated.id || fingerprint(task) !== generated.snapshot;
    }),
  ];
}

/** Completion events carry the same successor snapshot to every window. */
export function parseTaskCompletion(raw: unknown, taskId: string): TaskCompletion | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const value = JSON.parse(raw) as TaskCompletion;
    if (
      !value?.completed ||
      value.completed.id !== taskId ||
      !Number.isFinite(value.completed.completedAt)
    )
      return undefined;
    if (
      value.successor &&
      (typeof value.successor.id !== "string" ||
        value.completed.repeatSuccessor?.id !== value.successor.id)
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}

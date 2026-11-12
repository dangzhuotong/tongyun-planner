import type { Task } from "../types";
import { getLocalDateString } from "./date";

export const SAVED_VIEWS_KEY = "tongyun_saved_task_views";
export interface TaskView {
  id: string;
  name: string;
  query: string;
  category: string;
  tag: string;
  project: string;
  due: string;
  starred: boolean;
}

export function matchesTaskView(
  task: Task,
  project: string,
  due: string,
  now = new Date(),
): boolean {
  if (project === "none" && task.project) return false;
  if (project.startsWith("project:") && task.project !== project.slice(8)) return false;
  if (due === "all") return true;
  if (due === "none") return !task.dueDate;
  if (!task.dueDate) return false;
  const today = getLocalDateString(now);
  if (due === "overdue") return task.dueDate < today;
  if (due === "today") return task.dueDate === today;
  const end = new Date(now);
  end.setDate(end.getDate() + 6);
  return task.dueDate >= today && task.dueDate <= getLocalDateString(end);
}

export const REMINDER_OFFSETS = [0, 5, 15, 30, 60, 1440] as const;

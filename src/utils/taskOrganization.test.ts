import { describe, it, expect } from "vitest";
import type { Task } from "../types";
import { matchesTaskView } from "./taskOrganization";

const task = (dueDate?: string, project?: string) => ({ dueDate, project }) as Task;
const now = new Date(2026, 10, 26, 23, 59);

describe("daily task views", () => {
  it("shows one of 60 scheduled lessons on the first day, retaining the full plan", () => {
    const tasks = Array.from({ length: 60 }, (_, i) => {
      const date = new Date(2026, 10, 26 + i);
      return task(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    });
    expect(tasks.filter(t => matchesTaskView(t, "all", "actionable", now))).toEqual([tasks[0]]);
    expect(tasks.filter(t => matchesTaskView(t, "all", "all", now))).toHaveLength(60);
    expect(tasks.filter(t => matchesTaskView(t, "all", "today", new Date(2026, 10, 27)))).toEqual([tasks[1]]);
    expect(tasks).toHaveLength(60);
  });

  it("keeps overdue and undated work visible, even while hiding future work", () => {
    const tasks = [task("2026-11-25"), task(), task("2026-11-26"), task("2026-11-27")];
    expect(tasks.filter(t => matchesTaskView(t, "all", "actionable", now))).toEqual(tasks.slice(0, 3));
    expect(tasks.filter(t => matchesTaskView(t, "all", "today", now))).toEqual([tasks[2]]);
  });

  it("keeps saved project and date filters working", () => {
    expect(matchesTaskView(task("2026-11-26", "study"), "project:other", "actionable", now)).toBe(false);
    expect(matchesTaskView(task("2026-11-27", "study"), "project:study", "week", now)).toBe(true);
    expect(matchesTaskView(task("2026-12-03"), "all", "week", now)).toBe(false);
    expect(matchesTaskView(task(), "all", "none", now)).toBe(true);
  });
});

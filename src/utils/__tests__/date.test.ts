import { describe, it, expect } from "vitest";
import {
  getLocalDateString,
  parseLocalDate,
  addLocalDays,
  addLocalMonths,
  getHomeTaskKind,
  filterHomeActionableTasks,
} from "../date";

describe("date utils", () => {
  it("formats local date string correctly with zero padding", () => {
    const d = new Date(2026, 0, 5); // 2026-01-05
    expect(getLocalDateString(d)).toBe("2026-01-05");
  });

  it("parses local date without UTC offset shifting the day", () => {
    const parsed = parseLocalDate("2026-10-12");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(9); // 0-indexed
    expect(parsed?.getDate()).toBe(12);

    expect(parseLocalDate("invalid-date")).toBeNull();
  });

  it("adds local days accurately across month and year boundaries", () => {
    expect(addLocalDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addLocalDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addLocalDays("2026-10-12", -1)).toBe("2026-10-11");
  });

  it("adds local months accurately", () => {
    expect(addLocalMonths("2026-01-15", 2)).toBe("2026-03-15");
    expect(addLocalMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("determines home task kind correctly", () => {
    const today = "2026-10-12";
    expect(getHomeTaskKind({ dueDate: "2026-10-11" }, today)).toBe("overdue");
    expect(getHomeTaskKind({ dueDate: "2026-10-12" }, today)).toBe("today");
    expect(getHomeTaskKind({ dueDate: "2026-10-13" }, today)).toBeNull();
    expect(getHomeTaskKind({}, today)).toBe("undated");
  });

  it("filters and sorts home actionable tasks", () => {
    const today = "2026-10-12";
    const tasks = [
      { id: "1", title: "Future", dueDate: "2026-10-20", category: "urgent-important" },
      { id: "2", title: "Today", dueDate: "2026-10-12", category: "urgent-important" },
      { id: "3", title: "Overdue", dueDate: "2026-10-10", category: "important-not-urgent" },
      { id: "4", title: "Undated", category: "not-urgent-not-important" },
      { id: "5", title: "Pinned Today", dueDate: "2026-10-12", isPinned: true },
    ];

    const result = filterHomeActionableTasks(tasks, today);
    expect(result.map((t) => t.id)).toEqual(["5", "3", "2", "4"]);
  });
});

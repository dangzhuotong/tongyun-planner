import { describe, it, expect } from "vitest";
import {
  getLocalDateString,
  parseLocalDate,
  addLocalDays,
  addLocalMonths,
  getHomeTaskKind,
  filterHomeActionableTasks,
} from "./date";

describe("date utils", () => {
  describe("getLocalDateString", () => {
    it("should format date as YYYY-MM-DD with zero-padding", () => {
      const d = new Date(2026, 4, 3); // May 3, 2026
      expect(getLocalDateString(d)).toBe("2026-05-03");
    });
  });

  describe("parseLocalDate", () => {
    it("should correctly parse valid YYYY-MM-DD string into a local Date object", () => {
      const parsed = parseLocalDate("2026-10-15");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(9); // 0-indexed: October is 9
      expect(parsed?.getDate()).toBe(15);
    });

    it("should return null for invalid date strings", () => {
      expect(parseLocalDate("invalid")).toBeNull();
      expect(parseLocalDate("2026-05")).toBeNull();
      expect(parseLocalDate("2026-ab-cd")).toBeNull();
    });
  });

  describe("addLocalDays", () => {
    it("should add days to a given date string", () => {
      expect(addLocalDays("2026-05-10", 5)).toBe("2026-05-15");
      expect(addLocalDays("2026-05-31", 1)).toBe("2026-06-01");
      expect(addLocalDays("2026-05-10", -5)).toBe("2026-05-05");
    });
  });

  describe("addLocalMonths", () => {
    it("should add months to a given date string", () => {
      expect(addLocalMonths("2026-01-15", 2)).toBe("2026-03-15");
      expect(addLocalMonths("2026-11-15", 2)).toBe("2027-01-15");
      expect(addLocalMonths("2026-03-15", -1)).toBe("2026-02-15");
    });
  });

  describe("getHomeTaskKind", () => {
    const today = "2026-07-15";

    it("should return 'undated' when task has no dueDate", () => {
      expect(getHomeTaskKind({}, today)).toBe("undated");
      expect(getHomeTaskKind({ dueDate: undefined }, today)).toBe("undated");
      expect(getHomeTaskKind({ dueDate: "" }, today)).toBe("undated");
    });

    it("should return 'overdue' when dueDate is before today", () => {
      expect(getHomeTaskKind({ dueDate: "2026-07-14" }, today)).toBe("overdue");
      expect(getHomeTaskKind({ dueDate: "2026-01-01" }, today)).toBe("overdue");
    });

    it("should return 'today' when dueDate equals today", () => {
      expect(getHomeTaskKind({ dueDate: "2026-07-15" }, today)).toBe("today");
    });

    it("should return null for future due dates", () => {
      expect(getHomeTaskKind({ dueDate: "2026-07-16" }, today)).toBeNull();
      expect(getHomeTaskKind({ dueDate: "2026-12-31" }, today)).toBeNull();
    });
  });

  describe("filterHomeActionableTasks", () => {
    const today = "2026-07-15";

    it("should filter out future tasks and sort by pin, kind, and quadrant", () => {
      const tasks = [
        { id: "1", dueDate: "2026-07-20", category: "urgent-important" }, // future, should be excluded
        { id: "2", dueDate: "2026-07-15", category: "not-urgent-not-important" }, // today, Q4
        { id: "3", dueDate: "2026-07-14", category: "urgent-important" }, // overdue, Q1
        { id: "4", dueDate: undefined, isPinned: true, category: "not-urgent-not-important" }, // undated, pinned
        { id: "5", dueDate: "2026-07-15", category: "urgent-important" }, // today, Q1
        { id: "6", dueDate: "2026-07-10", category: "important-not-urgent" }, // overdue, Q2
      ];

      const filtered = filterHomeActionableTasks(tasks, today);

      // Future task id "1" excluded
      expect(filtered.map((t) => t.id)).toEqual([
        "4", // pinned comes first
        "3", // overdue, Q1
        "6", // overdue, Q2
        "5", // today, Q1
        "2", // today, Q4
      ]);
    });
  });
});

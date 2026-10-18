import { describe, it, expect } from "vitest";
import {
  getLocalDateString,
  parseLocalDate,
  addLocalDays,
  addLocalMonths,
  getHomeTaskKind,
  filterHomeActionableTasks,
} from "./date";

describe("date utils extra behavior", () => {
  describe("parseLocalDate overflow semantics", () => {
    it("rolls month overflow into the following year", () => {
      const parsed = parseLocalDate("2026-13-01");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2027);
      expect(parsed?.getMonth()).toBe(0);
      expect(parsed?.getDate()).toBe(1);
    });

    it("rolls day overflow into the following month", () => {
      const parsed = parseLocalDate("2026-02-31");
      expect(parsed?.getMonth()).toBe(2);
      expect(parsed?.getDate()).toBe(3);
    });

    it("returns null when the string has more or fewer than three parts", () => {
      expect(parseLocalDate("2026-01-02-03")).toBeNull();
      expect(parseLocalDate("2026--1-05")).toBeNull();
    });
  });

  describe("addLocalDays fallback when no base date", () => {
    it("uses today when dateStr is undefined", () => {
      expect(addLocalDays(undefined, 0)).toBe(getLocalDateString());
    });

    it("uses today plus offset when dateStr is undefined", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(addLocalDays(undefined, 1)).toBe(getLocalDateString(tomorrow));
    });
  });

  describe("addLocalMonths month-end rollover", () => {
    it("clamps Jan 31 + 1 month to the last day of February", () => {
      expect(addLocalMonths("2026-01-31", 1)).toBe("2026-02-28");
    });
  });

  describe("filterHomeActionableTasks ordering rules", () => {
    const today = "2026-07-15";

    it("returns an empty array for empty input", () => {
      expect(filterHomeActionableTasks([], today)).toEqual([]);
    });

    it("treats a missing category as important-not-urgent", () => {
      const tasks = [
        { id: "q3", dueDate: "2026-07-01", category: "urgent-not-important" },
        { id: "default", dueDate: "2026-07-01" },
      ];
      expect(filterHomeActionableTasks(tasks, today).map((t) => t.id)).toEqual(["default", "q3"]);
    });

    it("ranks unknown categories after every known quadrant", () => {
      const tasks = [
        { id: "unknown", dueDate: "2026-07-01", category: "bogus" },
        { id: "q4", dueDate: "2026-07-01", category: "not-urgent-not-important" },
        { id: "q1", dueDate: "2026-07-01", category: "urgent-important" },
      ];
      expect(filterHomeActionableTasks(tasks, today).map((t) => t.id)).toEqual([
        "q1",
        "q4",
        "unknown",
      ]);
    });

    it("keeps pinned tasks ahead of unpinned ones and orders pinned by kind", () => {
      const tasks = [
        { id: "pinned-today", dueDate: "2026-07-15", isPinned: true, category: "urgent-important" },
        { id: "pinned-overdue", dueDate: "2026-07-14", isPinned: true, category: "not-urgent-not-important" },
        { id: "plain-overdue", dueDate: "2026-07-10", category: "urgent-important" },
      ];
      expect(filterHomeActionableTasks(tasks, today).map((t) => t.id)).toEqual([
        "pinned-overdue",
        "pinned-today",
        "plain-overdue",
      ]);
    });

    it("drops all future tasks even when pinned", () => {
      const tasks = [
        { id: "future-pinned", dueDate: "2026-07-20", isPinned: true },
        { id: "today", dueDate: "2026-07-15" },
      ];
      expect(filterHomeActionableTasks(tasks, today).map((t) => t.id)).toEqual(["today"]);
    });
  });

  describe("getHomeTaskKind edge cases", () => {
    it("treats an empty dueDate as undated", () => {
      expect(getHomeTaskKind({ dueDate: "" }, "2026-07-15")).toBe("undated");
    });
  });
});

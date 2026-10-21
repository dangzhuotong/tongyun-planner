import { describe, expect, it } from "vitest";
import {
  applyDueAnchor,
  getNextDueDate,
  nextRepeatingDue,
  sanitizeRepeatAnchor,
  sanitizeRepeatAnchors,
  withMonthlyAnchor,
  type RepeatingDueFields,
} from "./nextDueDate";

describe("monthly repeat anchor day", () => {
  it("chains 1/31 -> 2/28 -> 3/31 -> 4/30", () => {
    const first = nextRepeatingDue({ dueDate: "2026-01-31", repeat: "monthly" });
    expect(first).toEqual({ dueDate: "2026-02-28", repeatAnchorDay: 31 });

    const second = nextRepeatingDue({
      dueDate: first.dueDate,
      repeat: "monthly",
      repeatAnchorDay: first.repeatAnchorDay,
    });
    expect(second).toEqual({ dueDate: "2026-03-31", repeatAnchorDay: 31 });

    const third = nextRepeatingDue({
      dueDate: second.dueDate,
      repeat: "monthly",
      repeatAnchorDay: second.repeatAnchorDay,
    });
    expect(third).toEqual({ dueDate: "2026-04-30", repeatAnchorDay: 31 });

    const fourth = nextRepeatingDue({
      dueDate: third.dueDate,
      repeat: "monthly",
      repeatAnchorDay: third.repeatAnchorDay,
    });
    expect(fourth).toEqual({ dueDate: "2026-05-31", repeatAnchorDay: 31 });
  });

  it("clamps an explicit 1/30 onto 2/28 and returns to the 30th in March", () => {
    expect(getNextDueDate("2026-01-30", "monthly", 30)).toBe("2026-02-28");

    const feb = nextRepeatingDue({
      dueDate: "2026-01-30",
      repeat: "monthly",
      repeatAnchorDay: 30,
    });
    expect(feb).toEqual({ dueDate: "2026-02-28", repeatAnchorDay: 30 });
    expect(
      nextRepeatingDue({
        dueDate: feb.dueDate,
        repeat: "monthly",
        repeatAnchorDay: feb.repeatAnchorDay,
      }).dueDate,
    ).toBe("2026-03-30");
  });

  it("uses the current due day when the anchor is missing", () => {
    expect(getNextDueDate("2026-02-28", "monthly")).toBe("2026-03-28");
    expect(nextRepeatingDue({ dueDate: "2026-02-28", repeat: "monthly" })).toEqual({
      dueDate: "2026-03-28",
      repeatAnchorDay: 28,
    });
  });

  it("ignores an anchor outside 1-31 and falls back to the current due day", () => {
    expect(getNextDueDate("2026-03-15", "monthly", 0)).toBe("2026-04-15");
    expect(getNextDueDate("2026-03-15", "monthly", 32)).toBe("2026-04-15");
  });

  it("stores the original day when a monthly task is created", () => {
    expect(withMonthlyAnchor({ dueDate: "2026-01-31", repeat: "monthly" }).repeatAnchorDay).toBe(
      31,
    );
    expect(withMonthlyAnchor({ dueDate: "2026-01-30", repeat: "daily" }).repeatAnchorDay).toBe(
      undefined,
    );
  });

  it("re-anchors when the user changes the due date", () => {
    const edited = applyDueAnchor(
      { dueDate: "2026-01-31", repeat: "monthly", repeatAnchorDay: 31 },
      { dueDate: "2026-01-15" },
    );
    expect(edited.repeatAnchorDay).toBe(15);
    expect(getNextDueDate(edited.dueDate, "monthly", edited.repeatAnchorDay)).toBe("2026-02-15");
  });

  it("keeps the anchor when a non-date field changes", () => {
    expect(
      applyDueAnchor(
        { dueDate: "2026-02-28", repeat: "monthly", repeatAnchorDay: 31 },
        { repeat: "monthly" },
      ).repeatAnchorDay,
    ).toBe(31);
  });

  it("clears the anchor when repeat leaves monthly and re-derives it from the current due date", () => {
    const monthly: RepeatingDueFields = {
      dueDate: "2026-02-28",
      repeat: "monthly",
      repeatAnchorDay: 31,
    };
    const daily = applyDueAnchor(monthly, { repeat: "daily" });
    expect(daily.repeat).toBe("daily");
    expect("repeatAnchorDay" in daily).toBe(false);

    expect("repeatAnchorDay" in applyDueAnchor(monthly, { repeat: "weekly" })).toBe(false);
    expect("repeatAnchorDay" in applyDueAnchor(monthly, { repeat: "none" })).toBe(false);

    const back = applyDueAnchor(daily, { repeat: "monthly" });
    expect(back.repeatAnchorDay).toBe(28);
    expect(getNextDueDate(back.dueDate, "monthly", back.repeatAnchorDay)).toBe("2026-03-28");

    const stale = applyDueAnchor(
      { dueDate: "2026-02-28", repeat: "daily", repeatAnchorDay: 31 },
      { repeat: "monthly" },
    );
    expect(stale.repeatAnchorDay).toBe(28);
  });

  it("chains a leap-year January 31 through February 29 back to March 31", () => {
    const feb = nextRepeatingDue({
      dueDate: "2024-01-31",
      repeat: "monthly",
      repeatAnchorDay: 31,
    });
    expect(feb).toEqual({ dueDate: "2024-02-29", repeatAnchorDay: 31 });

    const mar = nextRepeatingDue({
      dueDate: feb.dueDate,
      repeat: "monthly",
      repeatAnchorDay: feb.repeatAnchorDay,
    });
    expect(mar).toEqual({ dueDate: "2024-03-31", repeatAnchorDay: 31 });
  });

  it("chains December 31 across the year into February", () => {
    const jan = nextRepeatingDue({
      dueDate: "2026-12-31",
      repeat: "monthly",
      repeatAnchorDay: 31,
    });
    expect(jan).toEqual({ dueDate: "2027-01-31", repeatAnchorDay: 31 });

    const feb = nextRepeatingDue({
      dueDate: jan.dueDate,
      repeat: "monthly",
      repeatAnchorDay: jan.repeatAnchorDay,
    });
    expect(feb).toEqual({ dueDate: "2027-02-28", repeatAnchorDay: 31 });
  });

  it("keeps the chain anchored when due changes midway: monthly -> daily -> due -> monthly", () => {
    const first = nextRepeatingDue({ dueDate: "2026-01-31", repeat: "monthly" });
    expect(first).toEqual({ dueDate: "2026-02-28", repeatAnchorDay: 31 });

    const daily = applyDueAnchor(
      { dueDate: first.dueDate, repeat: "monthly", repeatAnchorDay: first.repeatAnchorDay },
      { repeat: "daily" },
    );
    expect(daily.repeat).toBe("daily");
    expect("repeatAnchorDay" in daily).toBe(false);

    const moved = applyDueAnchor(daily, { dueDate: "2026-03-10" });
    expect(moved.dueDate).toBe("2026-03-10");
    expect("repeatAnchorDay" in moved).toBe(false);

    const backToMonthly = applyDueAnchor(moved, { repeat: "monthly" });
    expect(backToMonthly.repeatAnchorDay).toBe(10);
    expect(nextRepeatingDue(backToMonthly)).toEqual({
      dueDate: "2026-04-10",
      repeatAnchorDay: 10,
    });
  });

  it("sanitizes dirty anchors before a whole object is imported or synced", () => {
    const staleDaily = {
      dueDate: "2026-02-28",
      repeat: "daily",
      repeatAnchorDay: 31,
    };
    const cleaned = sanitizeRepeatAnchor(staleDaily);
    expect(cleaned).toEqual({ dueDate: "2026-02-28", repeat: "daily" });
    expect(staleDaily.repeatAnchorDay).toBe(31);

    expect(
      sanitizeRepeatAnchor({
        dueDate: "2026-02-28",
        repeat: "monthly",
        repeatAnchorDay: 31,
      }).repeatAnchorDay,
    ).toBe(31);
    expect(
      "repeatAnchorDay" in
        sanitizeRepeatAnchor({
          dueDate: "2026-02-28",
          repeat: "monthly",
          repeatAnchorDay: 32,
        }),
    ).toBe(false);
    expect(
      "repeatAnchorDay" in
        sanitizeRepeatAnchor({
          dueDate: "2026-02-28",
          repeat: "monthly",
          repeatAnchorDay: 0,
        }),
    ).toBe(false);

    const clean = [{ dueDate: "2026-02-28", repeat: "daily" as const }];
    expect(sanitizeRepeatAnchors(clean)).toBe(clean);
  });

  it("rewrites a monthly anchor that disagrees with a mid-month due date", () => {
    const dirty = {
      dueDate: "2026-03-10",
      repeat: "monthly" as const,
      repeatAnchorDay: 31,
    };
    const cleaned = sanitizeRepeatAnchor(dirty);
    expect(cleaned.repeatAnchorDay).toBe(10);
    expect(dirty.repeatAnchorDay).toBe(31);
    expect(nextRepeatingDue(cleaned)).toEqual({ dueDate: "2026-04-10", repeatAnchorDay: 10 });
    expect(nextRepeatingDue(dirty)).toEqual({ dueDate: "2026-04-10", repeatAnchorDay: 10 });
    expect(getNextDueDate("2026-03-10", "monthly", 31)).toBe("2026-04-10");
  });

  it("keeps a later anchor on month-end and rewrites an earlier one", () => {
    expect(
      sanitizeRepeatAnchor({
        dueDate: "2026-04-30",
        repeat: "monthly",
        repeatAnchorDay: 31,
      }).repeatAnchorDay,
    ).toBe(31);
    expect(getNextDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(
      sanitizeRepeatAnchor({
        dueDate: "2026-02-28",
        repeat: "monthly",
        repeatAnchorDay: 15,
      }).repeatAnchorDay,
    ).toBe(28);
    expect(
      sanitizeRepeatAnchor({
        dueDate: "2026-03-31",
        repeat: "monthly",
        repeatAnchorDay: 31,
      }),
    ).toEqual({
      dueDate: "2026-03-31",
      repeat: "monthly",
      repeatAnchorDay: 31,
    });
  });
});

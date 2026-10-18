import { describe, expect, it } from "vitest";
import { applyDueAnchor, getNextDueDate, nextRepeatingDue, withMonthlyAnchor } from "./nextDueDate";

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
});

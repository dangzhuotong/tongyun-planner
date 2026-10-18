import { describe, expect, it } from "vitest";
import { addLocalMonths } from "./date";

/**
 * Monthly repeating tasks take their next due date from addLocalMonths(due, 1)
 * (getNextDueDate in src/hooks/useTasks.ts when repeat === "monthly").
 * A month-end source date must land on the last real day of the target month.
 */
describe("monthly repeat month-end boundary", () => {
  describe("January 31 plus one month", () => {
    it("lands on February 28 in a non-leap year", () => {
      expect(addLocalMonths("2025-01-31", 1)).toBe("2025-02-28");
      expect(addLocalMonths("2026-01-31", 1)).toBe("2026-02-28");
      expect(addLocalMonths("2027-01-31", 1)).toBe("2027-02-28");
    });

    it("lands on February 29 in a leap year", () => {
      expect(addLocalMonths("2024-01-31", 1)).toBe("2024-02-29");
      expect(addLocalMonths("2028-01-31", 1)).toBe("2028-02-29");
    });

    it("follows the Gregorian century rule", () => {
      // 1900 is divisible by 100 but not by 400, so February has 28 days.
      expect(addLocalMonths("1900-01-31", 1)).toBe("1900-02-28");
      // 2000 is divisible by 400, so February has 29 days.
      expect(addLocalMonths("2000-01-31", 1)).toBe("2000-02-29");
    });
  });

  describe("other month ends", () => {
    it("clamps the 31st onto the 30th of a short month", () => {
      expect(addLocalMonths("2026-03-31", 1)).toBe("2026-04-30");
      expect(addLocalMonths("2026-05-31", 1)).toBe("2026-06-30");
      expect(addLocalMonths("2026-08-31", 1)).toBe("2026-09-30");
      expect(addLocalMonths("2026-10-31", 1)).toBe("2026-11-30");
    });

    it("keeps day 31 when the target month has 31 days", () => {
      expect(addLocalMonths("2026-01-31", 2)).toBe("2026-03-31");
      expect(addLocalMonths("2026-07-31", 1)).toBe("2026-08-31");
      expect(addLocalMonths("2026-12-31", 1)).toBe("2027-01-31");
    });

    it("clamps March 31 back onto February", () => {
      expect(addLocalMonths("2026-03-31", -1)).toBe("2026-02-28");
      expect(addLocalMonths("2024-03-31", -1)).toBe("2024-02-29");
    });

    it("clamps February 29 when the target February is not a leap month", () => {
      expect(addLocalMonths("2024-02-29", 12)).toBe("2025-02-28");
      expect(addLocalMonths("2024-02-29", 48)).toBe("2028-02-29");
    });
  });
});

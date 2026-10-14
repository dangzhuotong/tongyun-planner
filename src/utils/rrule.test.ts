import { describe, it, expect } from "vitest";
import {
  parseRRule,
  rruleToLabel,
  getNextRRuleDate,
  buildRRule,
} from "./rrule";

describe("rrule utils", () => {
  describe("parseRRule", () => {
    it("should return null for empty string or 'none'", () => {
      expect(parseRRule("")).toBeNull();
      expect(parseRRule("none")).toBeNull();
    });

    it("should parse legacy shorthand recurrence strings", () => {
      expect(parseRRule("daily")).toEqual({ freq: "DAILY", interval: 1 });
      expect(parseRRule("weekly")).toEqual({ freq: "WEEKLY", interval: 1 });
      expect(parseRRule("monthly")).toEqual({ freq: "MONTHLY", interval: 1 });
    });

    it("should parse standard iCal-like RRULE strings", () => {
      const parsed = parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR");
      expect(parsed).toEqual({
        freq: "WEEKLY",
        interval: 2,
        byDay: [1, 3, 5],
      });
    });

    it("should parse monthly rule with bySetPos", () => {
      const parsed = parseRRule("FREQ=MONTHLY;INTERVAL=1;BYDAY=SU;BYSETPOS=-1");
      expect(parsed).toEqual({
        freq: "MONTHLY",
        interval: 1,
        byDay: [0],
        bySetPos: -1,
      });
    });

    it("should default interval to 1 when missing or invalid", () => {
      const parsed = parseRRule("FREQ=DAILY;INTERVAL=abc");
      expect(parsed).toEqual({
        freq: "DAILY",
        interval: 1,
      });
    });
  });

  describe("rruleToLabel", () => {
    it("should return empty string for unparseable rules", () => {
      expect(rruleToLabel("none")).toBe("");
      expect(rruleToLabel("")).toBe("");
    });

    it("should format daily recurrence labels", () => {
      expect(rruleToLabel("daily")).toBe("每天");
      expect(rruleToLabel("FREQ=DAILY;INTERVAL=3")).toBe("每3天");
      expect(rruleToLabel("FREQ=DAILY;INTERVAL=1;BYDAY=MO,WE")).toBe("每一、三");
      expect(rruleToLabel("FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE")).toBe("每2天一、三");
    });

    it("should format weekly recurrence labels", () => {
      expect(rruleToLabel("weekly")).toBe("每周");
      expect(rruleToLabel("FREQ=WEEKLY;INTERVAL=2")).toBe("每2每周");
      expect(rruleToLabel("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("工作日");
      expect(rruleToLabel("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH")).toBe("每周二、四");
      expect(rruleToLabel("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU")).toBe("每2每周六、日");
    });


    it("should accept custom localization dictionary", () => {
      const customT = {
        daily: "Daily",
        weekly: "Weekly",
        every: "Every ",
        day: " days",
      };
      expect(rruleToLabel("daily", customT)).toBe("Daily");
      expect(rruleToLabel("FREQ=DAILY;INTERVAL=5", customT)).toBe("Every 5 days");
    });
  });

  describe("getNextRRuleDate", () => {
    it("should return undefined for invalid or 'none' rule", () => {
      expect(getNextRRuleDate("2026-05-10", "none")).toBeUndefined();
      expect(getNextRRuleDate("2026-05-10", "")).toBeUndefined();
    });

    it("should calculate next daily date", () => {
      expect(getNextRRuleDate("2026-05-10", "daily")).toBe("2026-05-11");
      expect(getNextRRuleDate("2026-05-10", "FREQ=DAILY;INTERVAL=3")).toBe("2026-05-13");
      expect(getNextRRuleDate("2026-05-31", "daily")).toBe("2026-06-01");
    });

    it("should calculate next weekly date without byDay", () => {
      expect(getNextRRuleDate("2026-05-10", "weekly")).toBe("2026-05-17");
      expect(getNextRRuleDate("2026-05-10", "FREQ=WEEKLY;INTERVAL=2")).toBe("2026-05-24");
    });

    it("should calculate next weekly date with byDay", () => {
      // 2026-05-10 is a Sunday (day 0)
      // If rule repeats on Mon(1) and Wed(3), the next date is 2026-05-11 (Monday)
      expect(getNextRRuleDate("2026-05-10", "FREQ=WEEKLY;BYDAY=MO,WE")).toBe("2026-05-11");
      // From Monday 2026-05-11, the next occurrence is Wednesday 2026-05-13
      expect(getNextRRuleDate("2026-05-11", "FREQ=WEEKLY;BYDAY=MO,WE")).toBe("2026-05-13");
    });

    it("should calculate next monthly date and clamp days to month length", () => {
      expect(getNextRRuleDate("2026-05-15", "monthly")).toBe("2026-06-15");
      expect(getNextRRuleDate("2026-11-15", "FREQ=MONTHLY;INTERVAL=2")).toBe("2027-01-15");
      // 2026 is non-leap year: February has 28 days
      expect(getNextRRuleDate("2026-01-31", "monthly")).toBe("2026-02-28");
    });

    it("should calculate next monthly date with bySetPos", () => {
      // 2026-05-10: Next month is June 2026.
      // Last Friday of June 2026: June 30 is Tuesday, June 26 is Friday.
      expect(
        getNextRRuleDate("2026-05-10", "FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1"),
      ).toBe("2026-06-26");
    });
  });

  describe("buildRRule", () => {
    it("should build simple frequency rules", () => {
      expect(buildRRule("DAILY")).toBe("FREQ=DAILY");
      expect(buildRRule("WEEKLY")).toBe("FREQ=WEEKLY");
      expect(buildRRule("MONTHLY")).toBe("FREQ=MONTHLY");
    });

    it("should include interval when greater than 1", () => {
      expect(buildRRule("DAILY", { interval: 2 })).toBe("FREQ=DAILY;INTERVAL=2");
      expect(buildRRule("DAILY", { interval: 1 })).toBe("FREQ=DAILY");
    });

    it("should include byDay and map day numbers to iCal codes", () => {
      expect(buildRRule("WEEKLY", { byDay: [1, 3, 5] })).toBe(
        "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      );
      expect(buildRRule("WEEKLY", { byDay: [0, 6] })).toBe(
        "FREQ=WEEKLY;BYDAY=SU,SA",
      );
    });

    it("should include bySetPos when provided", () => {
      expect(buildRRule("MONTHLY", { byDay: [0], bySetPos: -1 })).toBe(
        "FREQ=MONTHLY;BYDAY=SU;BYSETPOS=-1",
      );
      expect(buildRRule("MONTHLY", { interval: 2, byDay: [1], bySetPos: 1 })).toBe(
        "FREQ=MONTHLY;INTERVAL=2;BYDAY=MO;BYSETPOS=1",
      );
    });
  });
});

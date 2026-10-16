import { describe, it, expect } from "vitest";
import { parseRRule, rruleToLabel, getNextRRuleDate, buildRRule } from "./rrule";

describe("rrule utils edge cases", () => {
  describe("parseRRule", () => {
    it("falls back to DAILY for an unsupported FREQ value", () => {
      expect(parseRRule("FREQ=YEARLY")).toEqual({ freq: "DAILY", interval: 1 });
    });

    it("filters out unrecognized BYDAY codes", () => {
      expect(parseRRule("FREQ=WEEKLY;BYDAY=XX,MO,ZZ")).toEqual({
        freq: "WEEKLY",
        interval: 1,
        byDay: [1],
      });
    });

    it("parses BYSETPOS without BYDAY", () => {
      expect(parseRRule("FREQ=MONTHLY;BYSETPOS=2")).toEqual({
        freq: "MONTHLY",
        interval: 1,
        bySetPos: 2,
      });
    });

    it("coerces an INTERVAL of 0 to 1", () => {
      expect(parseRRule("FREQ=WEEKLY;INTERVAL=0")).toEqual({ freq: "WEEKLY", interval: 1 });
    });

    it("ignores a rule body without any key=value parts", () => {
      expect(parseRRule("garbage")).toEqual({ freq: "DAILY", interval: 1 });
    });
  });

  describe("rruleToLabel", () => {
    it("labels the Nth weekday of a month", () => {
      expect(rruleToLabel("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2")).toBe("每月第2个周一");
    });

    it("labels the last weekday of a month", () => {
      expect(rruleToLabel("FREQ=MONTHLY;BYDAY=SU;BYSETPOS=-1")).toBe("每月最后个周日");
    });

    it("labels an interval monthly rule", () => {
      expect(rruleToLabel("FREQ=MONTHLY;INTERVAL=2")).toBe("每2每月");
    });

    it("labels a weekly rule restricted to specific days", () => {
      expect(rruleToLabel("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR")).toBe("每周一、三、五");
    });

    it("honors custom translations for monthly and weekday labels", () => {
      expect(rruleToLabel("monthly", { monthly: "Monthly" })).toBe("Monthly");
      expect(rruleToLabel("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", { weekday: "Weekdays" })).toBe(
        "Weekdays",
      );
    });
  });

  describe("getNextRRuleDate", () => {
    it("ignores BYDAY for daily rules", () => {
      expect(getNextRRuleDate("2026-05-10", "FREQ=DAILY;BYDAY=MO")).toBe("2026-05-11");
    });

    it("falls back to the interval when WEEKLY has no valid BYDAY", () => {
      expect(getNextRRuleDate("2026-05-10", "FREQ=WEEKLY;BYDAY=XX")).toBe("2026-05-17");
    });

    it("lets WEEKLY BYDAY take precedence over INTERVAL", () => {
      expect(getNextRRuleDate("2026-05-10", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")).toBe("2026-05-11");
    });

    it("wraps a large monthly interval across the year boundary", () => {
      expect(getNextRRuleDate("2026-05-15", "FREQ=MONTHLY;INTERVAL=12")).toBe("2027-05-15");
    });

    it("clamps the day when a monthly interval skips short months", () => {
      expect(getNextRRuleDate("2026-01-31", "FREQ=MONTHLY;INTERVAL=2")).toBe("2026-03-31");
    });

    it("computes the Nth weekday for a monthly BYSETPOS rule", () => {
      expect(getNextRRuleDate("2026-05-10", "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2")).toBe("2026-06-15");
    });

    it("falls back to the last weekday when the Nth does not exist", () => {
      expect(getNextRRuleDate("2026-05-10", "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5")).toBe("2026-06-29");
    });
  });

  describe("buildRRule", () => {
    it("omits BYDAY when the day list is empty", () => {
      expect(buildRRule("WEEKLY", { byDay: [] })).toBe("FREQ=WEEKLY");
    });

    it("keeps an explicit BYSETPOS of 0", () => {
      expect(buildRRule("MONTHLY", { bySetPos: 0 })).toBe("FREQ=MONTHLY;BYSETPOS=0");
    });

    it("omits an interval of 0 or 1", () => {
      expect(buildRRule("DAILY", { interval: 0 })).toBe("FREQ=DAILY");
      expect(buildRRule("DAILY", { interval: 1 })).toBe("FREQ=DAILY");
    });

    it("combines interval, BYDAY and BYSETPOS", () => {
      expect(buildRRule("MONTHLY", { interval: 3, byDay: [3], bySetPos: -1 })).toBe(
        "FREQ=MONTHLY;INTERVAL=3;BYDAY=WE;BYSETPOS=-1",
      );
    });
  });
});

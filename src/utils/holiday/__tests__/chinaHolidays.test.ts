import { describe, it, expect } from "vitest";
import {
  getBuiltinChinaHoliday,
  hasBuiltinYear,
  FIXED_ANNUAL_FESTIVALS,
  BUILTIN_CHINA_HOLIDAYS,
} from "../chinaHolidays";

describe("chinaHolidays (内置中国法定节假日年表)", () => {
  it("covers 2025 statutory holidays and compensatory workdays", () => {
    expect(getBuiltinChinaHoliday("2025-01-01")).toEqual({ type: "休", name: "元旦" });
    expect(getBuiltinChinaHoliday("2025-01-28")).toEqual({ type: "休", name: "除夕" });
    expect(getBuiltinChinaHoliday("2025-01-29")).toEqual({ type: "休", name: "春节" });
    expect(getBuiltinChinaHoliday("2025-01-26")).toEqual({ type: "班", name: "春节调休" });
    expect(getBuiltinChinaHoliday("2025-02-08")).toEqual({ type: "班", name: "春节调休" });
    expect(getBuiltinChinaHoliday("2025-05-01")).toEqual({ type: "休", name: "劳动节" });
    expect(getBuiltinChinaHoliday("2025-04-27")).toEqual({ type: "班", name: "劳动节调休" });
    expect(getBuiltinChinaHoliday("2025-10-01")).toEqual({ type: "休", name: "国庆节" });
    expect(getBuiltinChinaHoliday("2025-10-11")).toEqual({ type: "班", name: "国庆调休" });
  });

  it("covers 2026 (current year) exactly per the State Council notice", () => {
    // 元旦：1.1~1.3 放假，1.4 周日上班
    expect(getBuiltinChinaHoliday("2026-01-01")).toEqual({ type: "休", name: "元旦" });
    expect(getBuiltinChinaHoliday("2026-01-02")).toEqual({ type: "休", name: "元旦" });
    expect(getBuiltinChinaHoliday("2026-01-03")).toEqual({ type: "休", name: "元旦" });
    expect(getBuiltinChinaHoliday("2026-01-04")).toEqual({ type: "班", name: "元旦调休" });

    // 春节：2.15~2.23 放假共 9 天，2.14 与 2.28 上班
    expect(getBuiltinChinaHoliday("2026-02-14")).toEqual({ type: "班", name: "春节调休" });
    expect(getBuiltinChinaHoliday("2026-02-15")).toEqual({ type: "休", name: "春节" });
    expect(getBuiltinChinaHoliday("2026-02-16")).toEqual({ type: "休", name: "除夕" });
    expect(getBuiltinChinaHoliday("2026-02-23")).toEqual({ type: "休", name: "春节" });
    expect(getBuiltinChinaHoliday("2026-02-28")).toEqual({ type: "班", name: "春节调休" });

    // 清明：4.4~4.6 放假，无调休上班
    expect(getBuiltinChinaHoliday("2026-04-04")).toEqual({ type: "休", name: "清明节" });
    expect(getBuiltinChinaHoliday("2026-04-06")).toEqual({ type: "休", name: "清明节" });
    expect(getBuiltinChinaHoliday("2026-04-07")).toBeNull();

    // 劳动节：5.1~5.5 放假共 5 天，5.9 周六上班
    expect(getBuiltinChinaHoliday("2026-05-01")).toEqual({ type: "休", name: "劳动节" });
    expect(getBuiltinChinaHoliday("2026-05-05")).toEqual({ type: "休", name: "劳动节" });
    expect(getBuiltinChinaHoliday("2026-05-09")).toEqual({ type: "班", name: "劳动节调休" });

    // 端午：6.19~6.21
    expect(getBuiltinChinaHoliday("2026-06-19")).toEqual({ type: "休", name: "端午节" });

    // 中秋：9.25~9.27
    expect(getBuiltinChinaHoliday("2026-09-25")).toEqual({ type: "休", name: "中秋节" });

    // 国庆：10.1~10.7 放假共 7 天，9.20 与 10.10 上班
    expect(getBuiltinChinaHoliday("2026-09-20")).toEqual({ type: "班", name: "国庆调休" });
    expect(getBuiltinChinaHoliday("2026-10-01")).toEqual({ type: "休", name: "国庆节" });
    expect(getBuiltinChinaHoliday("2026-10-07")).toEqual({ type: "休", name: "国庆节" });
    expect(getBuiltinChinaHoliday("2026-10-10")).toEqual({ type: "班", name: "国庆调休" });
  });

  it("covers 2027 (next year)", () => {
    expect(getBuiltinChinaHoliday("2027-01-01")).toEqual({ type: "休", name: "元旦" });
    expect(getBuiltinChinaHoliday("2027-01-31")).toEqual({ type: "班", name: "春节调休" });
    expect(getBuiltinChinaHoliday("2027-02-05")).toEqual({ type: "休", name: "除夕" });
    expect(getBuiltinChinaHoliday("2027-02-20")).toEqual({ type: "班", name: "春节调休" });
    expect(getBuiltinChinaHoliday("2027-05-01")).toEqual({ type: "休", name: "劳动节" });
    expect(getBuiltinChinaHoliday("2027-10-01")).toEqual({ type: "休", name: "国庆节" });
  });

  it("returns null for non-statutory dates", () => {
    expect(getBuiltinChinaHoliday("2026-03-15")).toBeNull();
    expect(getBuiltinChinaHoliday("2026-07-20")).toBeNull();
    expect(getBuiltinChinaHoliday("2026-11-11")).toBeNull();
  });

  it("has fixed annual festivals defined", () => {
    expect(FIXED_ANNUAL_FESTIVALS["12-25"]).toBe("圣诞节");
  });

  it("knows which years have authoritative built-in tables", () => {
    expect(hasBuiltinYear(2025)).toBe(true);
    expect(hasBuiltinYear(2026)).toBe(true);
    expect(hasBuiltinYear(2027)).toBe(true);
    expect(hasBuiltinYear(2028)).toBe(false);
  });

  it("marks 班 only on dates that fall on a weekend", () => {
    for (const date of Object.keys(BUILTIN_CHINA_HOLIDAYS)) {
      const entry = BUILTIN_CHINA_HOLIDAYS[date]!;
      const day = new Date(`${date}T00:00:00`).getDay();
      const isWeekend = day === 0 || day === 6;
      // 调休补班只发生在原本休息的周末日
      if (entry.type === "班") {
        expect(isWeekend, `${date} 标为调休补班但不是周末`).toBe(true);
      }
    }
  });

  it("every entry has a valid type and a non-empty name", () => {
    for (const date of Object.keys(BUILTIN_CHINA_HOLIDAYS)) {
      const entry = BUILTIN_CHINA_HOLIDAYS[date]!;
      expect(["休", "班"]).toContain(entry.type);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});

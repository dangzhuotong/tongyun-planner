import { describe, it, expect, vi, afterEach } from "vitest";
import { formatNaturalPreview, parseNaturalDate } from "../dateParser";

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function shiftDays(days: number): string {
  const date = startOfToday();
  date.setDate(date.getDate() + days);
  return ymd(date);
}

describe("Natural Date Parser", () => {
  it("parses tomorrow relative to today", () => {
    const res = parseNaturalDate("明天 14:00 参加会议");
    expect(res).toBeDefined();
    expect(res?.dueTime).toBe("14:00");

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const expectedDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(res?.dueDate).toBe(expectedDate);
  });

  it("parses day after tomorrow", () => {
    const res = parseNaturalDate("后天早上9点");
    expect(res).toBeDefined();
    expect(res?.dueTime).toBe("09:00");

    const now = new Date();
    const dayAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const expectedDate = `${dayAfter.getFullYear()}-${String(dayAfter.getMonth() + 1).padStart(2, "0")}-${String(dayAfter.getDate()).padStart(2, "0")}`;
    expect(res?.dueDate).toBe(expectedDate);
  });

  it("parses afternoon time notation", () => {
    const res = parseNaturalDate("今天下午3点");
    expect(res?.dueTime).toBe("15:00");
  });

  it("parses 大后天 as three days ahead, not 后天", () => {
    const res = parseNaturalDate("大后天交稿");
    expect(res?.dueDate).toBe(shiftDays(3));
    expect(res?.dueTime).toBeUndefined();
  });

  afterEach(() => vi.useRealTimers());

  it.each([
    ["下周一开会", "2026-11-09"],
    ["下周五评审", "2026-11-13"],
    ["下周日休息", "2026-11-15"],
    ["本周五评审", "2026-11-06"],
    ["这个星期三复盘", "2026-11-04"],
  ])("uses calendar weeks for %s", (text, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 12));
    expect(parseNaturalDate(text)?.dueDate).toBe(expected);
  });

  it("clamps relative months at month end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 12));
    expect(parseNaturalDate("1个月后续费")?.dueDate).toBe("2026-02-28");
  });

  it("parses 下个月 as the first day of next month", () => {
    const today = startOfToday();
    const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    expect(parseNaturalDate("下个月发工资")?.dueDate).toBe(ymd(first));
  });

  it("parses 周末 as the Saturday of this week", () => {
    const date = startOfToday();
    date.setDate(date.getDate() + (6 - date.getDay()));
    expect(parseNaturalDate("周末整理书架")?.dueDate).toBe(ymd(date));
  });

  it("parses N 天后 from today", () => {
    expect(parseNaturalDate("3天后提醒")?.dueDate).toBe(shiftDays(3));
  });

  it("parses N 周后 as that many weeks", () => {
    expect(parseNaturalDate("2周后回访")?.dueDate).toBe(shiftDays(14));
  });

  it("parses N 个月后 on the same day, clamped to month end", () => {
    const date = startOfToday();
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
    expect(parseNaturalDate("1个月后续费")?.dueDate).toBe(ymd(date));
  });

  it("converts an evening clock time to 24-hour", () => {
    const res = parseNaturalDate("晚上7:30吃饭");
    expect(res?.dueTime).toBe("19:30");
    expect(res?.dueDate).toBe(shiftDays(0));
  });

  it("parses 点半 in the afternoon as thirty minutes past", () => {
    expect(parseNaturalDate("下午3点半开会")?.dueTime).toBe("15:30");
  });

  it("previews today, nearby days, and a far date", () => {
    expect(formatNaturalPreview({ dueDate: shiftDays(0) })).toBe("今天");
    expect(formatNaturalPreview({ dueDate: shiftDays(1), dueTime: "09:00" })).toBe("明天 09:00");
    expect(formatNaturalPreview({ dueDate: shiftDays(2) })).toBe("后天");
    expect(formatNaturalPreview({ dueDate: shiftDays(-1) })).toBe("昨天");
    expect(formatNaturalPreview({ dueDate: "2020-01-15" })).toBe("2020-01-15");
  });
});

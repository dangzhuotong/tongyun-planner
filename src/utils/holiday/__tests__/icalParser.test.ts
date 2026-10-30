import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractIcalDate,
  getDatesBetween,
  classifyHolidayType,
  cleanSummaryName,
  parseICal,
  fetchAndParseICal,
} from "../icalParser";

describe("icalParser (iCal 解析与容错)", () => {
  describe("extractIcalDate", () => {
    it("extracts YYYY-MM-DD from various iCal date representations", () => {
      expect(extractIcalDate("20261001")).toBe("2026-10-01");
      expect(extractIcalDate("2026-10-01")).toBe("2026-10-01");
      expect(extractIcalDate("20261001T090000Z")).toBe("2026-10-01");
      expect(extractIcalDate("20261001T170000")).toBe("2026-10-01");
      expect(extractIcalDate("")).toBeNull();
      expect(extractIcalDate("invalid")).toBeNull();
    });
  });

  describe("getDatesBetween", () => {
    it("returns single date when end date is missing or equal to start", () => {
      expect(getDatesBetween("2026-10-01")).toEqual(["2026-10-01"]);
      expect(getDatesBetween("2026-10-01", "2026-10-01")).toEqual(["2026-10-01"]);
    });

    it("returns all dates between start and end (exclusive of end)", () => {
      // 2026-10-01 to 2026-10-04 (iCal all-day convention: 1st, 2nd, 3rd)
      expect(getDatesBetween("2026-10-01", "2026-10-04")).toEqual([
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
      ]);
    });
  });

  describe("classifyHolidayType", () => {
    it("classifies events as 休 or 班 properly", () => {
      expect(classifyHolidayType("国庆节")).toBe("休");
      expect(classifyHolidayType("香港特别行政区成立纪念日")).toBe("休");
      expect(classifyHolidayType("劳动节放假")).toBe("休");
      expect(classifyHolidayType("周日调休上班 (班)")).toBe("班");
      expect(classifyHolidayType("春节补班")).toBe("班");
      expect(classifyHolidayType("工作日")).toBe("班");
    });

    it("does not misclassify ordinary English holiday titles as workdays", () => {
      // 回归防护：早期实现用宽泛的 /work/ 匹配，会把英文公众假期标题误判成工作日
      expect(classifyHolidayType("The first day of January")).toBe("休");
      expect(classifyHolidayType("Labour Day")).toBe("休");
      expect(classifyHolidayType("Christmas Day")).toBe("休");
      expect(classifyHolidayType("Lunar New Year's Day")).toBe("休");
      expect(classifyHolidayType("Handover Day")).toBe("休");
    });

    it("still recognises English workday markers", () => {
      expect(classifyHolidayType("Working day")).toBe("班");
      expect(classifyHolidayType("Make-up workday")).toBe("班");
    });

    it("treats empty summary as 休", () => {
      expect(classifyHolidayType("")).toBe("休");
      expect(classifyHolidayType("   ")).toBe("休");
    });
  });

  describe("cleanSummaryName", () => {
    it("removes redundant prefix tags like [休] (班)", () => {
      expect(cleanSummaryName("[休] 国庆节")).toBe("国庆节");
      expect(cleanSummaryName("春节调休 (班)")).toBe("春节调休");
      expect(cleanSummaryName("(休) 中秋节")).toBe("中秋节");
    });
  });

  describe("parseICal", () => {
    it("returns error on invalid or empty content without crashing", () => {
      expect(parseICal("").ok).toBe(false);
      expect(parseICal("   ").ok).toBe(false);
      expect(parseICal("<html><body>404 Not Found</body></html>").ok).toBe(false);
      expect(parseICal("random plain text without calendar tags").ok).toBe(false);
    });

    it("parses valid RFC 5545 iCal text with single and multi-day events", () => {
      const sampleIcs = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TongYun Test//EN
BEGIN:VEVENT
UID:evt-1
DTSTART;VALUE=DATE:20261001
DTEND;VALUE=DATE:20261004
SUMMARY:国庆节假期 [休]
END:VEVENT
BEGIN:VEVENT
UID:evt-2
DTSTART;VALUE=DATE:20261010
SUMMARY:调休上班 (班)
END:VEVENT
BEGIN:VEVENT
UID:evt-3
STATUS:CANCELLED
DTSTART;VALUE=DATE:20261020
SUMMARY:已取消的假期
END:VEVENT
END:VCALENDAR
      `.trim();

      const result = parseICal(sampleIcs);
      expect(result.ok).toBe(true);
      expect(result.count).toBe(4); // 3 days for 国庆节 + 1 day for 调休上班
      expect(result.holidays["2026-10-01"]).toEqual({ type: "休", name: "国庆节假期" });
      expect(result.holidays["2026-10-02"]).toEqual({ type: "休", name: "国庆节假期" });
      expect(result.holidays["2026-10-03"]).toEqual({ type: "休", name: "国庆节假期" });
      expect(result.holidays["2026-10-10"]).toEqual({ type: "班", name: "调休上班" });
      // Cancelled event not included
      expect(result.holidays["2026-10-20"]).toBeUndefined();
    });

    it("handles folded lines per RFC 5545", () => {
      const foldedIcs = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20261225",
        "SUMMARY:圣诞",
        " 节特别假",
        " 期",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      const result = parseICal(foldedIcs);
      expect(result.ok).toBe(true);
      expect(result.holidays["2026-12-25"]).toEqual({ type: "休", name: "圣诞节特别假期" });
    });

    it("parses the real Hong Kong 1823 public holidays feed format", () => {
      // 取自 https://www.1823.gov.hk/common/ical/en.ics 的真实结构
      const hkIcs = [
        "BEGIN:VCALENDAR",
        "PRODID:-//1823 Contact Centre, HKSARG//Hong Kong Public Holidays//EN",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "X-WR-TIMEZONE:Asia/Hong_Kong",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20250101",
        "DTEND;VALUE=DATE:20250102",
        "DTSTAMP:20250506T035044Z",
        "TRANSP:TRANSPARENT",
        "UID:20250101@1823.gov.hk",
        "SUMMARY:The first day of January",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20250129",
        "DTEND;VALUE=DATE:20250130",
        "UID:20250129@1823.gov.hk",
        "SUMMARY:Lunar New Year’s Day",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      const result = parseICal(hkIcs);
      expect(result.ok).toBe(true);
      expect(result.count).toBe(2);
      // 英文公众假期标题不应被误判为工作日
      expect(result.holidays["2025-01-01"]).toEqual({
        type: "休",
        name: "The first day of January",
      });
      expect(result.holidays["2025-01-29"]).toEqual({ type: "休", name: "Lunar New Year’s Day" });
    });

    it("ignores events without a valid DTSTART instead of crashing", () => {
      const badIcs = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "SUMMARY:没有开始时间的事件",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260701",
        "SUMMARY:正常事件",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      const result = parseICal(badIcs);
      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
      expect(result.holidays["2026-07-01"]).toBeDefined();
    });
  });

  describe("fetchAndParseICal", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("rejects non-http URLs without throwing or crashing", async () => {
      const res1 = await fetchAndParseICal("");
      expect(res1.ok).toBe(false);
      expect(res1.error).toContain("URL 为空");

      const res2 = await fetchAndParseICal("file:///etc/passwd");
      expect(res2.ok).toBe(false);
      expect(res2.error).toContain("合法链接");

      const res3 = await fetchAndParseICal("not_a_url");
      expect(res3.ok).toBe(false);
      expect(res3.error).toContain("合法链接");
    });

    it("handles network failure and HTTP errors gracefully", async () => {
      // 抓取会先试 dev proxy 再试直连，两次都要返回同样的失败结果
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const res = await fetchAndParseICal("https://example.com/holidays.ics");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("404");
    });

    it("reports a clear error when the URL returns a non-calendar page", async () => {
      // 填了一个能打开但不是 .ics 的地址：应给出可读错误，不崩溃
      (fetch as any).mockResolvedValue({
        ok: true,
        text: async () => "<html><body>404 Not Found</body></html>",
      });

      const res = await fetchAndParseICal("https://example.com/not-a-calendar");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("BEGIN:VCALENDAR");
      expect(res.count).toBe(0);
      expect(res.holidays).toEqual({});
    });

    it("reports a clear error when the network request throws", async () => {
      (fetch as any).mockRejectedValue(new Error("Failed to fetch"));

      const res = await fetchAndParseICal("https://example.com/holidays.ics");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("获取日历失败");
    });

    it("reports a clear error on timeout", async () => {
      const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
      (fetch as any).mockRejectedValue(abortError);

      const res = await fetchAndParseICal("https://example.com/slow.ics");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("超时");
    });

    it("parses fetched iCal content on success", async () => {
      const validIcs = `
BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260701
SUMMARY:香港特别行政区成立纪念日
END:VEVENT
END:VCALENDAR
      `.trim();

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => validIcs,
      });

      const res = await fetchAndParseICal("https://www.1823.gov.hk/common/ical/tc.ics");
      expect(res.ok).toBe(true);
      expect(res.holidays["2026-07-01"]).toEqual({
        type: "休",
        name: "香港特别行政区成立纪念日",
      });
    });
  });
});

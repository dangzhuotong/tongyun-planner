import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractJournalTags,
  getDueDateCountdown,
  getVisibleNoises,
  setVisibleNoises,
  NOISE_DEFINITIONS,
} from "./constants";

describe("constants & pure helpers", () => {
  describe("extractJournalTags", () => {
    it("should extract unique #tags from journal content", () => {
      const content = `
#工作 今天完成了新版本的规划。
还抽空去跑步了，打卡 #健身 #健康生活。
重复标签测试：#工作 #健身
带横线和下划线：#project-alpha #daily_review
`;
      const tags = extractJournalTags(content);
      expect(tags).toContain("工作");
      expect(tags).toContain("健身");
      expect(tags).toContain("健康生活");
      expect(tags).toContain("project-alpha");
      expect(tags).toContain("daily_review");
      // Deduplication check
      expect(tags.filter((t) => t === "工作").length).toBe(1);
      expect(tags.filter((t) => t === "健身").length).toBe(1);
    });

    it("should return empty array when content contains no tags", () => {
      expect(extractJournalTags("普通正文内容，没有标签。")).toEqual([]);
      expect(extractJournalTags("")).toEqual([]);
    });
  });

  describe("getDueDateCountdown", () => {
    it("should return null when dueDateStr is missing or invalid", () => {
      expect(getDueDateCountdown(undefined)).toBeNull();
      expect(getDueDateCountdown("")).toBeNull();
      expect(getDueDateCountdown("2026-05")).toBeNull();
    });

    it("should calculate correct countdown for date-only format", () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      const resToday = getDueDateCountdown(todayStr);
      expect(resToday?.isToday).toBe(true);
      expect(resToday?.isOverdue).toBe(false);
      expect(resToday?.text).toBe("今天到期");

      const pastDate = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
      const pastStr = `${pastDate.getFullYear()}-${pad(pastDate.getMonth() + 1)}-${pad(pastDate.getDate())}`;
      const resPast = getDueDateCountdown(pastStr);
      expect(resPast?.isOverdue).toBe(true);
      expect(resPast?.days).toBe(2);
      expect(resPast?.text).toBe("已逾期 2 天");

      const futureDate = new Date(now.getTime() + 5 * 24 * 3600 * 1000);
      const futureStr = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`;
      const resFuture = getDueDateCountdown(futureStr);
      expect(resFuture?.isOverdue).toBe(false);
      expect(resFuture?.isToday).toBe(false);
      expect(resFuture?.days).toBe(5);
      expect(resFuture?.text).toBe("还剩 5 天");
    });

    it("should calculate countdown with dueTimeStr", () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      // A future time today
      const resSameDay = getDueDateCountdown(todayStr, "23:59");
      if (now.getHours() < 23) {
        expect(resSameDay?.isToday).toBe(true);
        expect(resSameDay?.text).toBe("今天 23:59");
      }

      // An overdue time earlier today
      const pastHour = Math.max(0, now.getHours() - 2);
      const resPastTime = getDueDateCountdown(todayStr, `${pad(pastHour)}:00`);
      if (now.getHours() >= 2) {
        expect(resPastTime?.isOverdue).toBe(true);
      }
    });
  });

  describe("getVisibleNoises & setVisibleNoises", () => {
    const mockStore: Record<string, string> = {};

    beforeEach(() => {
      for (const k of Object.keys(mockStore)) delete mockStore[k];
      const storageMock = {
        getItem: (key: string) => mockStore[key] ?? null,
        setItem: (key: string, value: string) => {
          mockStore[key] = String(value);
        },
        removeItem: (key: string) => {
          delete mockStore[key];
        },
        clear: () => {
          for (const k of Object.keys(mockStore)) delete mockStore[k];
        },
        get length() {
          return Object.keys(mockStore).length;
        },
        key: (i: number) => Object.keys(mockStore)[i] ?? null,
      };
      vi.stubGlobal("localStorage", storageMock);
    });

    it("should default to all defined noise IDs when none stored", () => {
      const noises = getVisibleNoises();
      expect(noises).toEqual(NOISE_DEFINITIONS.map((n) => n.id));
    });

    it("should store and retrieve customized visible noises", () => {
      setVisibleNoises(["rain", "ocean"]);
      expect(getVisibleNoises()).toEqual(["rain", "ocean"]);
    });
  });
});

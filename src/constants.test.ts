import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractJournalTags,
  getDueDateCountdown,
  getVisibleNoises,
  setVisibleNoises,
  NOISE_DEFINITIONS,
  PLANNER_COLORS,
  CATEGORY_META,
  JOURNAL_TEMPLATES,
  DEFAULT_AI_CLASSIFY_PROMPT,
  PRIORITY_OPTIONS,
  PRIORITY_LEVELS,
  PRIORITY_META,
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

  describe("task priority & category metadata", () => {
    it("should define 4 Eisenhower matrix priority options", () => {
      expect(PRIORITY_OPTIONS.length).toBe(4);
      const values = PRIORITY_OPTIONS.map((o) => o.value);
      expect(values).toContain("urgent-important");
      expect(values).toContain("important-not-urgent");
      expect(values).toContain("urgent-not-important");
      expect(values).toContain("not-urgent-not-important");
    });

    it("should define priority levels and priority metadata", () => {
      expect(PRIORITY_LEVELS.length).toBe(3);
      expect(PRIORITY_META.high.label).toBe("高");
      expect(PRIORITY_META.medium.label).toBe("中");
      expect(PRIORITY_META.low.label).toBe("低");
    });

    it("should define complete styling for all 4 quadrants in CATEGORY_META", () => {
      const quadrants = [
        "urgent-important",
        "important-not-urgent",
        "urgent-not-important",
        "not-urgent-not-important",
      ] as const;
      for (const q of quadrants) {
        expect(CATEGORY_META[q]).toBeDefined();
        expect(CATEGORY_META[q].label.length).toBeGreaterThan(0);
        expect(CATEGORY_META[q].dot).toMatch(/^bg-\[#[0-9a-fA-F]{6}\]$/);
        expect(CATEGORY_META[q].text).toMatch(/^text-\[#[0-9a-fA-F]{6}\]$/);
      }
    });
  });

  describe("PLANNER_COLORS palette", () => {
    it("should define 6 warm theme colors with complete attributes", () => {
      const expectedKeys = ["rose", "mint", "sky", "lavender", "coral", "yellow"];
      expect(Object.keys(PLANNER_COLORS).sort()).toEqual(expectedKeys.sort());

      for (const color of Object.values(PLANNER_COLORS)) {
        expect(color.bg).toMatch(/^bg-\[#[0-9a-fA-F]{6}\]$/);
        expect(color.border).toMatch(/^border-\[#[0-9a-fA-F]{6}\]$/);
        expect(color.text).toMatch(/^text-\[#[0-9a-fA-F]{6}\]$/);
        expect(color.dot).toMatch(/^bg-\[#[0-9a-fA-F]{6}\]$/);
        expect(color.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(color.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe("JOURNAL_TEMPLATES", () => {
    it("should contain default journal templates including blank, morning and review", () => {
      expect(JOURNAL_TEMPLATES.length).toBeGreaterThanOrEqual(4);
      const ids = JOURNAL_TEMPLATES.map((t) => t.id);
      expect(ids).toContain("blank");
      expect(ids).toContain("morning");
      expect(ids).toContain("review");
      expect(ids).toContain("weekly");

      for (const template of JOURNAL_TEMPLATES) {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(typeof template.content).toBe("string");
      }
    });
  });

  describe("DEFAULT_AI_CLASSIFY_PROMPT", () => {
    it("should contain all four quadrant identifiers", () => {
      expect(DEFAULT_AI_CLASSIFY_PROMPT).toContain("urgent-important");
      expect(DEFAULT_AI_CLASSIFY_PROMPT).toContain("important-not-urgent");
      expect(DEFAULT_AI_CLASSIFY_PROMPT).toContain("urgent-not-important");
      expect(DEFAULT_AI_CLASSIFY_PROMPT).toContain("not-urgent-not-important");
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readDailyCache, writeDailyCache } from "./dailyCache";

describe("dailyCache utils", () => {
  const mockStore: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
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

  describe("writeDailyCache and readDailyCache", () => {
    it("should write and read cache for the same date and locale", () => {
      const today = "2026-10-15";
      const locale = "zh-CN";
      const data = { suggestion: "Stay hydrated and focus" };

      writeDailyCache("ai_suggestion", today, locale, data);
      const cached = readDailyCache<typeof data>("ai_suggestion", today, locale);

      expect(cached).toEqual(data);
    });

    it("should return null if key does not exist", () => {
      expect(readDailyCache("non_existent", "2026-10-15", "zh-CN")).toBeNull();
    });

    it("should return null if cached date does not match today", () => {
      writeDailyCache("ai_suggestion", "2026-10-14", "zh-CN", "yesterday value");
      const cached = readDailyCache<string>("ai_suggestion", "2026-10-15", "zh-CN");

      expect(cached).toBeNull();
    });

    it("should return null if cached locale differs from requested locale", () => {
      writeDailyCache("ai_suggestion", "2026-10-15", "zh-CN", "chinese text");
      const cached = readDailyCache<string>("ai_suggestion", "2026-10-15", "en");

      expect(cached).toBeNull();
    });

    it("should return data if cached payload has no locale specified (legacy format)", () => {
      const today = "2026-10-15";
      mockStore["legacy_key"] = JSON.stringify({
        date: today,
        data: "legacy data without locale",
      });

      const cached = readDailyCache<string>("legacy_key", today, "zh-CN");
      expect(cached).toBe("legacy data without locale");
    });

    it("should return null if stored JSON is invalid", () => {
      mockStore["broken_key"] = "{invalid json";
      expect(readDailyCache("broken_key", "2026-10-15", "zh-CN")).toBeNull();
    });

    it("should gracefully handle localStorage quota exception on write", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      expect(() => {
        writeDailyCache("test_key", "2026-10-15", "zh-CN", "data");
      }).not.toThrow();
    });
  });
});

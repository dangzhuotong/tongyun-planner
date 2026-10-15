import { describe, it, expect } from "vitest";
import { DEFAULT_HABITS } from "./types";

describe("types and constants", () => {
  describe("DEFAULT_HABITS", () => {
    it("should export an array of default habit templates", () => {
      expect(Array.isArray(DEFAULT_HABITS)).toBe(true);
      expect(DEFAULT_HABITS.length).toBeGreaterThan(0);
    });

    it("should have valid name and emoji for every default habit", () => {
      for (const habit of DEFAULT_HABITS) {
        expect(typeof habit.name).toBe("string");
        expect(habit.name.trim().length).toBeGreaterThan(0);
        expect(typeof habit.emoji).toBe("string");
        expect(habit.emoji.trim().length).toBeGreaterThan(0);
      }
    });

    it("should include core lifestyle habits", () => {
      const names = DEFAULT_HABITS.map((h) => h.name);
      expect(names).toContain("锻炼");
      expect(names).toContain("阅读");
      expect(names).toContain("冥想");
      expect(names).toContain("早睡");
      expect(names).toContain("喝水");
    });
  });
});

import { describe, it, expect } from "vitest";
import { tokenize, matchesSearch, findMatchRanges } from "./textSearch";

describe("textSearch utils", () => {
  describe("tokenize", () => {
    it("should return empty array for empty string", () => {
      expect(tokenize("")).toEqual([]);
    });

    it("should tokenize English text", () => {
      const tokens = tokenize("Focus and Productivity");
      expect(tokens).toContain("focus");
      expect(tokens).toContain("and");
      expect(tokens).toContain("productivity");
    });

    it("should tokenize Chinese text if Intl.Segmenter is supported", () => {
      const tokens = tokenize("四象限待办与翻页手帐");
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("matchesSearch", () => {
    it("should return false for empty or whitespace query", () => {
      expect(matchesSearch("hello world", "")).toBe(false);
      expect(matchesSearch("hello world", "   ")).toBe(false);
    });

    it("should match single word case-insensitively", () => {
      expect(matchesSearch("TongYun Planner Desktop", "planner")).toBe(true);
      expect(matchesSearch("TongYun Planner Desktop", "PLANNER")).toBe(true);
      expect(matchesSearch("TongYun Planner Desktop", "mobile")).toBe(false);
    });

    it("should match multiple words (AND condition)", () => {
      expect(matchesSearch("TongYun Planner Desktop App", "tongyun desktop")).toBe(true);
      expect(matchesSearch("TongYun Planner Desktop App", "tongyun mobile")).toBe(false);
    });

    it("should match Chinese phrases", () => {
      expect(matchesSearch("这是一个关于手帐和专注的日记", "手帐 专注")).toBe(true);
      expect(matchesSearch("这是一个关于手帐和专注的日记", "番茄钟")).toBe(false);
    });
  });

  describe("findMatchRanges", () => {
    it("should return empty array when query is empty or whitespace", () => {
      expect(findMatchRanges("test content", "")).toEqual([]);
      expect(findMatchRanges("test content", "  ")).toEqual([]);
    });

    it("should find exact match ranges", () => {
      const text = "abc test def test ghi";
      const ranges = findMatchRanges(text, "test");
      expect(ranges).toEqual([
        [4, 8],
        [13, 17],
      ]);
    });

    it("should merge overlapping ranges when searching multi-word queries", () => {
      const text = "react-router-dom";
      const ranges = findMatchRanges(text, "react router");
      expect(ranges.length).toBeGreaterThan(0);
      // Ensure merged ranges do not overlap
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][1]);
      }
    });
  });
});

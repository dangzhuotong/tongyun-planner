import { describe, it, expect } from "vitest";
import { tokenize, matchesSearch, findMatchRanges } from "./textSearch";

describe("textSearch filter behavior", () => {
  describe("tokenize", () => {
    it("strips punctuation and lowercases word tokens", () => {
      const tokens = tokenize("Hello, World!");
      expect(tokens).toContain("hello");
      expect(tokens).toContain("world");
    });
  });

  describe("matchesSearch", () => {
    it("trims surrounding whitespace from the query", () => {
      expect(matchesSearch("Hello World", "  world  ")).toBe(true);
    });

    it("requires every query word to be present", () => {
      expect(matchesSearch("Hello World", "world hello")).toBe(true);
      expect(matchesSearch("Hello", "hello universe")).toBe(false);
    });
  });

  describe("findMatchRanges", () => {
    it("finds all case-insensitive occurrences of a single word", () => {
      expect(findMatchRanges("Hello hello HELLO", "hello")).toEqual([
        [0, 5],
        [6, 11],
        [12, 17],
      ]);
    });

    it("merges overlapping ranges", () => {
      expect(findMatchRanges("aaaa", "aa")).toEqual([[0, 4]]);
    });

    it("splits a multi-word query and matches each word independently", () => {
      expect(findMatchRanges("react-router-dom", "react dom")).toEqual([
        [0, 5],
        [13, 16],
      ]);
    });

    it("returns no ranges when nothing matches", () => {
      expect(findMatchRanges("abc", "xyz")).toEqual([]);
    });
  });
});

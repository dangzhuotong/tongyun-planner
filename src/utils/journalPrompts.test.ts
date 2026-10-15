import { describe, it, expect } from "vitest";
import {
  JOURNAL_PROMPTS,
  getDailyJournalPrompt,
  formatPromptForJournal,
} from "./journalPrompts";

describe("journalPrompts utils", () => {
  describe("JOURNAL_PROMPTS list", () => {
    it("should contain predefined journal inspiration prompts", () => {
      expect(JOURNAL_PROMPTS.length).toBeGreaterThan(0);
      const validCategories = new Set(["gratitude", "reflection", "discovery", "healing"]);

      const ids = new Set<string>();
      for (const p of JOURNAL_PROMPTS) {
        expect(p.id).toBeTruthy();
        expect(validCategories.has(p.category)).toBe(true);
        expect(p.question.trim().length).toBeGreaterThan(0);
        expect(p.hint.trim().length).toBeGreaterThan(0);
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      }
    });
  });

  describe("getDailyJournalPrompt", () => {
    it("should return a prompt deterministically for the same date", () => {
      const dateStr = "2026-10-15";
      const promptA = getDailyJournalPrompt(dateStr);
      const promptB = getDailyJournalPrompt(dateStr);

      expect(promptA).toBeDefined();
      expect(promptA.id).toBe(promptB.id);
      expect(promptA.question).toBe(promptB.question);
    });

    it("should return different prompts when offset is changed", () => {
      const dateStr = "2026-10-15";
      const prompt0 = getDailyJournalPrompt(dateStr, 0);
      const prompt1 = getDailyJournalPrompt(dateStr, 1);

      expect(prompt0).toBeDefined();
      expect(prompt1).toBeDefined();
      // Consecutive offsets produce different prompts when length > 1
      expect(prompt0.id).not.toBe(prompt1.id);
    });

    it("should work with default parameters when called with no arguments", () => {
      const prompt = getDailyJournalPrompt();
      expect(prompt).toBeDefined();
      expect(JOURNAL_PROMPTS).toContainEqual(prompt);
    });
  });

  describe("formatPromptForJournal", () => {
    it("should format the prompt into a Markdown blockquote", () => {
      const sample = JOURNAL_PROMPTS[0];
      const formatted = formatPromptForJournal(sample);

      expect(formatted).toContain("> 💡 **今日灵感微问**：");
      expect(formatted).toContain(sample.question);
      expect(formatted.endsWith("\n\n")).toBe(true);
    });
  });
});

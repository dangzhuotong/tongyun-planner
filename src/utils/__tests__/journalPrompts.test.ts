import { describe, expect, it } from "vitest";
import { getDailyJournalPrompt, formatPromptForJournal, JOURNAL_PROMPTS } from "../journalPrompts";

describe("journalPrompts utility", () => {
  it("returns deterministic prompt for the same date", () => {
    const p1 = getDailyJournalPrompt("2026-10-15");
    const p2 = getDailyJournalPrompt("2026-10-15");
    expect(p1.id).toBe(p2.id);
    expect(p1.question).toBe(p2.question);
  });

  it("changes prompt when offset is applied (换一换)", () => {
    const p1 = getDailyJournalPrompt("2026-10-15", 0);
    const p2 = getDailyJournalPrompt("2026-10-15", 1);
    if (JOURNAL_PROMPTS.length > 1) {
      expect(p1.id).not.toBe(p2.id);
    }
  });

  it("formats prompt into clean Markdown quote block", () => {
    const prompt = JOURNAL_PROMPTS[0];
    const formatted = formatPromptForJournal(prompt);
    expect(formatted).toContain("> 💡 **今日灵感微问**：");
    expect(formatted).toContain(prompt.question);
  });
});

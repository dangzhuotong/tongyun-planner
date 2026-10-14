import { describe, it, expect } from "vitest";
import { buildDefaultCommentPrompt } from "./aiPrompts";

describe("aiPrompts utils", () => {
  it("should generate system prompt containing the requested language", () => {
    const promptZh = buildDefaultCommentPrompt("中文");
    expect(promptZh).toContain('你是"暖评"');
    expect(promptZh).toContain("用中文写一段简短、温暖、真诚的回应");
    expect(promptZh).toContain("事实");
    expect(promptZh).toContain("情绪");
    expect(promptZh).toContain("需要");
    expect(promptZh).toContain("意义");

    const promptEn = buildDefaultCommentPrompt("English");
    expect(promptEn).toContain("用English写一段简短、温暖、真诚的回应");
  });
});

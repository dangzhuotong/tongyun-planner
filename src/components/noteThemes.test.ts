import { describe, it, expect } from "vitest";
import { NOTE_COLORS } from "./noteThemes";

describe("noteThemes configuration", () => {
  it("should define color configs for all 5 sticky note themes", () => {
    const expectedThemes = ["tea", "rose", "mint", "lavender", "sky"] as const;
    expect(Object.keys(NOTE_COLORS).sort()).toEqual([...expectedThemes].sort());
  });

  it("should provide valid Tailwind classes and hex accents for every theme", () => {
    for (const [, theme] of Object.entries(NOTE_COLORS)) {
      expect(theme.bg).toMatch(/^bg-\[#[0-9a-fA-F]{6}\]$/);
      expect(theme.border).toMatch(/^border-\[#[0-9a-fA-F]{6}\]$/);
      expect(theme.text).toMatch(/^text-\[#[0-9a-fA-F]{6}\]$/);
      expect(theme.shadow).toContain("/30");
      expect(theme.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.dot).toMatch(/^bg-\[#[0-9a-fA-F]{6}\]$/);
    }
  });

  it("should have matching text color and accent hex values for visual consistency", () => {
    for (const theme of Object.values(NOTE_COLORS)) {
      expect(theme.text).toContain(theme.accent);
      expect(theme.dot).toContain(theme.accent);
    }
  });
});

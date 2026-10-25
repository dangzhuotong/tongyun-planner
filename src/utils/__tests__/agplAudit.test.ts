import { describe, it, expect } from "vitest";

describe("P-AA-05: AGPL & itsaplan Zero Inclusion Audit", () => {
  it("ensures no production files or imports reference itsaplan or AGPL in src/", () => {
    const modules = import.meta.glob<string>("../../**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    });

    const entries = Object.entries(modules);
    expect(entries.length).toBeGreaterThan(10);

    const agplRegex = new RegExp(
      ["GNU", "Affero", "General", "Public", "License"].join("\\s+"),
      "i",
    );
    const itsaplanRegex = new RegExp("itsaplan", "i");

    for (const [file, content] of entries) {
      if (file.includes("agplAudit.test.ts")) continue;
      expect(content).not.toMatch(/from\s+['"][^'"]*itsaplan/i);
      expect(content).not.toMatch(/require\(['"][^'"]*itsaplan/i);
      expect(content).not.toMatch(agplRegex);
      expect(content).not.toMatch(itsaplanRegex);
    }
  });
});

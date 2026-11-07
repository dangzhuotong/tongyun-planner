import { describe, expect, it } from "vitest";
import { formatDiagnosticMessage } from "./diagnosticLog";

describe("diagnostic log lines", () => {
  it("collapses whitespace before the line is queued", () => {
    expect(formatDiagnosticMessage("a\n\nb")).toBe("a b");
    expect(formatDiagnosticMessage(` ${"x".repeat(2_100)} `).length).toBe(2_000);
  });
});
import { describe, it, expect } from "vitest";
import { parseNaturalDate } from "../dateParser";

describe("Natural Date Parser", () => {
  it("parses tomorrow relative to today", () => {
    const res = parseNaturalDate("明天 14:00 参加会议");
    expect(res).toBeDefined();
    expect(res?.dueTime).toBe("14:00");

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const expectedDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(res?.dueDate).toBe(expectedDate);
  });

  it("parses day after tomorrow", () => {
    const res = parseNaturalDate("后天早上9点");
    expect(res).toBeDefined();
    expect(res?.dueTime).toBe("09:00");

    const now = new Date();
    const dayAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const expectedDate = `${dayAfter.getFullYear()}-${String(dayAfter.getMonth() + 1).padStart(2, "0")}-${String(dayAfter.getDate()).padStart(2, "0")}`;
    expect(res?.dueDate).toBe(expectedDate);
  });

  it("parses afternoon time notation", () => {
    const res = parseNaturalDate("今天下午3点");
    expect(res?.dueTime).toBe("15:00");
  });
});

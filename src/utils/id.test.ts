import { describe, it, expect } from "vitest";
import { createId } from "./id";

describe("createId", () => {
  it("should generate a non-empty string ID without prefix", () => {
    const id = createId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("should prepend the given prefix when provided", () => {
    const prefix = "task";
    const id = createId(prefix);
    expect(id.startsWith("task-")).toBe(true);
    expect(id.length).toBeGreaterThan("task-".length);
  });

  it("should generate unique IDs across consecutive invocations", () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      set.add(createId("item"));
    }
    expect(set.size).toBe(50);
  });
});

import { describe, it, expect } from "vitest";
import { beginSyncApply, endSyncApply, isSyncApplying } from "./syncApplyGuard";

describe("syncApplyGuard", () => {
  it("should track sync apply depth and handle delayed reset", async () => {
    expect(isSyncApplying()).toBe(false);

    beginSyncApply();
    expect(isSyncApplying()).toBe(true);

    beginSyncApply();
    expect(isSyncApplying()).toBe(true);

    endSyncApply();
    // In current turn before setTimeout fires, still active
    expect(isSyncApplying()).toBe(true);

    // Wait for setTimeout(..., 0)
    await new Promise((r) => setTimeout(r, 10));
    expect(isSyncApplying()).toBe(true); // depth was 2, now 1

    endSyncApply();
    await new Promise((r) => setTimeout(r, 10));
    expect(isSyncApplying()).toBe(false); // depth was 1, now 0
  });
});

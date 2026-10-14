import { describe, it, expect } from "vitest";
import { shouldPullCategory, categoryVersionAfterPull } from "./pullDecision";

describe("pullDecision utils", () => {
  describe("shouldPullCategory", () => {
    it("should return false if remoteVer is not greater than 0", () => {
      expect(shouldPullCategory(0, 0, false)).toBe(false);
      expect(shouldPullCategory(0, 0, true)).toBe(false);
      expect(shouldPullCategory(100, -1, true)).toBe(false);
      expect(shouldPullCategory(100, NaN, true)).toBe(false);
    });

    it("should return true when force is true and remoteVer > 0", () => {
      // Even if local is newer or equal
      expect(shouldPullCategory(200, 100, true)).toBe(true);
      expect(shouldPullCategory(100, 100, true)).toBe(true);
      expect(shouldPullCategory(50, 100, true)).toBe(true);
    });

    it("should pull when force is false only if localVer < remoteVer", () => {
      expect(shouldPullCategory(50, 100, false)).toBe(true);
      expect(shouldPullCategory(100, 100, false)).toBe(false);
      expect(shouldPullCategory(150, 100, false)).toBe(false);
    });
  });

  describe("categoryVersionAfterPull", () => {
    it("should keep newer local version on forced pull", () => {
      // Local is newer: keep localVer to prevent version rollback
      expect(categoryVersionAfterPull(200, 100, true)).toBe(200);
      expect(categoryVersionAfterPull(100, 100, true)).toBe(100);
    });

    it("should use remote version on forced pull if remote is newer", () => {
      expect(categoryVersionAfterPull(50, 100, true)).toBe(100);
    });

    it("should always use remote version when force is false", () => {
      expect(categoryVersionAfterPull(50, 100, false)).toBe(100);
      expect(categoryVersionAfterPull(100, 100, false)).toBe(100);
      expect(categoryVersionAfterPull(150, 100, false)).toBe(100);
    });
  });
});

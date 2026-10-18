import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isTauri, resolveDisplayedAppVersion, checkForAppUpdate } from "./updater";

describe("updater utils", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      delete (window as any).__TAURI_INTERNALS__;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveDisplayedAppVersion", () => {
    it("should strip leading 'v' or 'V' from version string", () => {
      expect(resolveDisplayedAppVersion("v1.2.3", "1.0.0")).toBe("1.2.3");
      expect(resolveDisplayedAppVersion("V2.0.0", "1.0.0")).toBe("2.0.0");
      expect(resolveDisplayedAppVersion("1.5.0", "1.0.0")).toBe("1.5.0");
    });

    it("should prioritize runtimeVersion over bundledVersion", () => {
      expect(resolveDisplayedAppVersion("1.3.0", "1.1.1")).toBe("1.3.0");
      expect(resolveDisplayedAppVersion("v1.4.0", "v1.1.0")).toBe("1.4.0");
    });

    it("should fall back to bundledVersion when runtimeVersion is null, undefined, or empty", () => {
      expect(resolveDisplayedAppVersion(null, "1.1.1")).toBe("1.1.1");
      expect(resolveDisplayedAppVersion(undefined, "v1.1.1")).toBe("1.1.1");
      expect(resolveDisplayedAppVersion("", "1.1.1")).toBe("1.1.1");
      expect(resolveDisplayedAppVersion("   ", "1.1.1")).toBe("1.1.1");
    });

    it("should trim surrounding whitespace", () => {
      expect(resolveDisplayedAppVersion("  v1.2.0  ", "1.0.0")).toBe("1.2.0");
      expect(resolveDisplayedAppVersion(null, "  1.1.0  ")).toBe("1.1.0");
    });
  });

  describe("isTauri & checkForAppUpdate in non-Tauri environment", () => {
    it("should return false for isTauri when __TAURI_INTERNALS__ is not present", () => {
      expect(isTauri()).toBe(false);
    });

    it("should return null for checkForAppUpdate in browser/test environment", async () => {
      const update = await checkForAppUpdate();
      expect(update).toBeNull();
    });
  });
});

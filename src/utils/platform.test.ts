import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isMacOS, initPlatformClass } from "./platform";

describe("platform utils", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return false when navigator is undefined", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isMacOS()).toBe(false);
  });

  it("should return true when userAgent contains Mac", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
    });
    expect(isMacOS()).toBe(true);
  });

  it("should return false on Windows userAgent", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
    });
    expect(isMacOS()).toBe(false);
  });

  it("should inject platform-macos class into document.documentElement when macOS is detected", () => {
    const classList = new Set<string>();
    const docMock = {
      documentElement: {
        classList: {
          add: (cls: string) => classList.add(cls),
          contains: (cls: string) => classList.has(cls),
        },
      },
    };
    vi.stubGlobal("document", docMock);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
    });

    const isMac = initPlatformClass();
    expect(isMac).toBe(true);
    expect(classList.has("platform-macos")).toBe(true);
  });
});

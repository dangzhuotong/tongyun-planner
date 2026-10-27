import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkIsMobile, MOBILE_BREAKPOINT } from "./useIsMobile";

describe("checkIsMobile", () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const storageMock = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStore[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.stubGlobal("window", { innerWidth: 1024 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when width is below MOBILE_BREAKPOINT", () => {
    expect(checkIsMobile(MOBILE_BREAKPOINT - 1)).toBe(true);
    expect(checkIsMobile(375)).toBe(true);
    expect(checkIsMobile(414)).toBe(true);
  });

  it("returns false when width is at or above MOBILE_BREAKPOINT", () => {
    expect(checkIsMobile(MOBILE_BREAKPOINT)).toBe(false);
    expect(checkIsMobile(1024)).toBe(false);
    expect(checkIsMobile(1440)).toBe(false);
  });

  it("respects forced parameter", () => {
    expect(checkIsMobile(1024, true)).toBe(true);
    expect(checkIsMobile(375, false)).toBe(false);
  });

  it("respects localStorage override", () => {
    localStorage.setItem("tongyun_force_mobile", "true");
    expect(checkIsMobile(1440)).toBe(true);
  });
});

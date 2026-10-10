import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isMacOS, initPlatformClass } from "../platform";

describe("platform utils", () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      writable: true,
      configurable: true,
    });
  });

  it("当 userAgent 或 platform 包含 Mac 时 isMacOS 返回 true", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" },
      writable: true,
      configurable: true,
    });
    expect(isMacOS()).toBe(true);
  });

  it("当 Windows 或 Linux 环境时 isMacOS 返回 false", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" },
      writable: true,
      configurable: true,
    });
    expect(isMacOS()).toBe(false);
  });

  it("initPlatformClass 会在 macOS 环境给 document.documentElement 添加 platform-macos class", () => {
    const classList = new Set<string>();
    const mockDoc = {
      documentElement: {
        classList: {
          add: (cls: string) => classList.add(cls),
          contains: (cls: string) => classList.has(cls),
        },
      },
    };

    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: mockDoc,
      writable: true,
      configurable: true,
    });

    const result = initPlatformClass();
    expect(result).toBe(true);
    expect(classList.has("platform-macos")).toBe(true);
  });
});

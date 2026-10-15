import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scheduleStorageWrite, flushPendingStorage } from "./deferredStorage";

describe("deferredStorage utils", () => {
  const mockStore: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    const storageMock = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStore[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStore)) delete mockStore[k];
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.stubGlobal("window", {
      setTimeout: (fn: (...args: any[]) => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: any) => clearTimeout(id),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    flushPendingStorage();
    vi.restoreAllMocks();
  });

  it("should flush scheduled items immediately when flushPendingStorage is called", () => {
    scheduleStorageWrite("test_key_1", { foo: "bar" }, 5000);
    expect(mockStore["test_key_1"]).toBeUndefined();

    flushPendingStorage();
    expect(mockStore["test_key_1"]).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("should store plain string values directly without extra JSON quotes", () => {
    scheduleStorageWrite("string_key", "raw-string-value", 1000);
    flushPendingStorage();
    expect(mockStore["string_key"]).toBe("raw-string-value");
  });

  it("should overwrite earlier pending writes for the same key", () => {
    scheduleStorageWrite("counter", 1, 5000);
    scheduleStorageWrite("counter", 2, 5000);
    scheduleStorageWrite("counter", 3, 5000);

    flushPendingStorage();
    expect(mockStore["counter"]).toBe("3");
  });

  it("should flush multiple scheduled keys at once", () => {
    scheduleStorageWrite("key_a", [1, 2, 3], 5000);
    scheduleStorageWrite("key_b", { active: true }, 5000);

    flushPendingStorage();
    expect(mockStore["key_a"]).toBe("[1,2,3]");
    expect(mockStore["key_b"]).toBe(JSON.stringify({ active: true }));
  });

  it("should write automatically after the delay elapses", async () => {
    scheduleStorageWrite("auto_key", "auto_value", 20);
    expect(mockStore["auto_key"]).toBeUndefined();

    await new Promise((r) => setTimeout(r, 60));
    expect(mockStore["auto_key"]).toBe("auto_value");
  });

  it("should catch and log localStorage write failures without throwing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(localStorage, "setItem").mockImplementation((key: string) => {
      if (key === "failing_key") {
        throw new Error("Disk full");
      }
      mockStore[key] = "ok";
    });

    scheduleStorageWrite("failing_key", "value", 1000);
    scheduleStorageWrite("succeeding_key", "value", 1000);

    expect(() => flushPendingStorage()).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(mockStore["succeeding_key"]).toBe("ok");
  });
});

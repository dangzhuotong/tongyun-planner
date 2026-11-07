import { expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _args?: unknown[]) => ({})),
  select: vi.fn(async () => []),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: async () => db } }));
vi.mock("../data/domainDatabase", () => ({ initializeDomainDatabase: async () => {} }));
import { storage } from "./unifiedStorage";
it("retries a failed SQLite mirror write on the next explicit flush", async () => {
  vi.useFakeTimers();
  const store = new Map<string, string>();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, setTimeout, clearTimeout });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await storage.init();
    db.execute.mockClear();
    db.execute.mockRejectedValueOnce(new Error("temporary SQLite failure"));
    localStorage.setItem("aero_todos", "latest");
    await storage.flushNow();
    await storage.flushNow();
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls[1]?.[1]).toEqual(["aero_todos", "latest"]);
  } finally {
    errors.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

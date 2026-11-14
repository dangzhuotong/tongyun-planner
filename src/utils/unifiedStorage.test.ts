import { afterEach, beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _args?: unknown[]) => ({})),
  select: vi.fn<() => Promise<{ key: string; value: string }[]>>(async () => []),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: async () => db } }));
vi.mock("../data/domainDatabase", () => ({ initializeDomainDatabase: async () => {} }));
import { UnifiedStorage } from "./unifiedStorage";

const store = new Map<string, string>();
function installWebview() {
  vi.stubGlobal("localStorage", {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, setTimeout, clearTimeout });
  db.select.mockReset().mockResolvedValue([]);
  db.execute.mockClear();
  store.clear();
  installWebview();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("retries a failed SQLite mirror write on the next explicit flush", async () => {
  const storage = new UnifiedStorage();
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
  }
});

it("recovers writes and removals when SQLite is still at the pre-close state", async () => {
  const stale = [
    { key: "aero_todos", value: "old" },
    { key: "aero_completed_todos", value: "old" },
  ];
  db.select.mockResolvedValue(stale);
  await new UnifiedStorage().init();
  localStorage.setItem("aero_todos", "new");
  localStorage.removeItem("aero_completed_todos");
  localStorage.setItem("new_preference", "new key");
  // The first window disappeared without its debounce running. Its native storage survives.
  vi.clearAllTimers();
  installWebview();
  const restarted = new UnifiedStorage();
  await restarted.init();
  expect(localStorage.getItem("aero_todos")).toBe("new");
  expect(localStorage.getItem("aero_completed_todos")).toBeNull();
  await restarted.flushNow();
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE"), [
    "aero_todos",
    "new",
  ]);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [
    "aero_completed_todos",
  ]);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT OR REPLACE"), [
    "new_preference",
    "new key",
  ]);
});

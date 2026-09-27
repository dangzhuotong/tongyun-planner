import { describe, it, expect, beforeEach } from "vitest";
import { ALL_SYNC_CATEGORIES } from "../types";

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

describe("SyncEngine dirty persistence and offline", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = new LocalStorageMock() as unknown as Storage;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });
  });

  it("reloads pending dirty categories after a restart", async () => {
    localStorage.setItem("tongyun_sync_dirty", JSON.stringify(["tasks", "journal"]));
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    expect(engine.dirty).toBe(true);
    engine.markDirty("config");
    expect(JSON.parse(localStorage.getItem("tongyun_sync_dirty") || "[]").sort()).toEqual(
      ["config", "journal", "tasks"].sort()
    );
  });

  it("ignores unknown dirty category names from storage", async () => {
    localStorage.setItem("tongyun_sync_dirty", JSON.stringify(["tasks", "notACategory", 1]));
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    expect(engine.dirty).toBe(true);
    engine.markDirty("stickyNotes");
    expect(JSON.parse(localStorage.getItem("tongyun_sync_dirty") || "[]").sort()).toEqual(
      ["stickyNotes", "tasks"].sort()
    );
  });

  it("markDirty with no args marks every category and persists", async () => {
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    engine.markDirty();
    expect(JSON.parse(localStorage.getItem("tongyun_sync_dirty") || "[]").sort()).toEqual(
      [...ALL_SYNC_CATEGORIES].sort()
    );
  });

  it("stays offline and keeps dirty when navigator is offline", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    localStorage.setItem("tongyun_sync_backend", "webdav");
    localStorage.setItem("tongyun_webdav_url", "https://dav.jianguoyun.com/dav/");
    localStorage.setItem("tongyun_webdav_user", "user@test.com");
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    engine.markDirty("tasks");
    await engine.sync();
    expect(engine.status).toBe("offline");
    expect(engine.dirty).toBe(true);
    expect(JSON.parse(localStorage.getItem("tongyun_sync_dirty") || "[]")).toEqual(["tasks"]);
  });
});

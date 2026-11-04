import { describe, it, expect, beforeEach, vi } from "vitest";
import { ALL_SYNC_CATEGORIES, SYNC_APPLIED_EVENT } from "../types";
import {
  scheduleStorageWrite,
  registerPersistenceFlusher,
  flushPendingStorage,
} from "../../deferredStorage";

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
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      new LocalStorageMock() as unknown as Storage;
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
      ["config", "journal", "tasks"].sort(),
    );
  });

  it("ignores unknown dirty category names from storage", async () => {
    localStorage.setItem("tongyun_sync_dirty", JSON.stringify(["tasks", "notACategory", 1]));
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    expect(engine.dirty).toBe(true);
    engine.markDirty("stickyNotes");
    expect(JSON.parse(localStorage.getItem("tongyun_sync_dirty") || "[]").sort()).toEqual(
      ["stickyNotes", "tasks"].sort(),
    );
  });

  it("markDirty with no args marks every category and persists", async () => {
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    engine.markDirty();
    expect(JSON.parse(localStorage.getItem("tongyun_sync_dirty") || "[]").sort()).toEqual(
      [...ALL_SYNC_CATEGORIES].sort(),
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

  it("defaults to WebDAV backend when WebDAV credentials are present", async () => {
    localStorage.removeItem("tongyun_sync_backend");
    localStorage.setItem("tongyun_webdav_url", "https://dav.jianguoyun.com/dav/");
    localStorage.setItem("tongyun_webdav_user", "user@test.com");
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    expect(engine.currentBackend).toBe("webdav");
  });

  it("handles backend set to none", async () => {
    localStorage.setItem("tongyun_sync_backend", "none");
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    expect(engine.currentBackend).toBe("none");
  });

  it("resolveConflicts resolves and clears dirty status even if conflicts array is empty", async () => {
    localStorage.setItem("tongyun_sync_dirty", JSON.stringify(["tasks"]));
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    expect(engine.dirty).toBe(true);
    // Mock webdavProvider methods
    (engine.webdavProvider as any).uploadCategory = async () => {};
    (engine.webdavProvider as any).pull = async () => ({});

    await engine.resolveConflicts("local");
    expect(engine.status).toBe("success");
    expect(engine.dirty).toBe(false);
    expect(JSON.parse(localStorage.getItem("tongyun_sync_dirty") || "[]")).toEqual([]);
  });

  it("requestReopenConflictModal dispatches custom event", async () => {
    const target = new EventTarget();
    (globalThis as any).window = target;
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    let dispatched = false;
    target.addEventListener("tongyun-reopen-conflict-modal", () => {
      dispatched = true;
    });
    engine.requestReopenConflictModal();
    expect(dispatched).toBe(true);
    delete (globalThis as any).window;
  });
  it("uploads edits made during an in-flight upload in a second round", async () => {
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    const oldTask = { id: "t", title: "old", category: "important-not-urgent" };
    localStorage.setItem("aero_todos", JSON.stringify([oldTask]));
    engine.setBackend("webdav");
    vi.spyOn(engine.webdavProvider, "isConfigured").mockReturnValue(true);
    vi.spyOn(engine.webdavProvider, "pull").mockResolvedValue(null);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const uploading = new Promise<void>((r) => {
      entered = r;
    });
    const uploaded: string[] = [];
    vi.spyOn(engine.webdavProvider, "push").mockImplementation(async (data) => {
      uploaded.push(data.tasks[0].title);
      if (uploaded.length === 1) {
        entered();
        await gate;
      }
      return { conflicts: [] };
    });
    engine.markDirty("tasks");
    const sync = engine.sync();
    await uploading;
    // A task edit has not yet reached localStorage when its dirty marker is set.
    vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
    vi.stubGlobal("document", new EventTarget());
    const applied: string[] = [];
    window.addEventListener(SYNC_APPLIED_EVENT, (event) => {
      const data = (event as CustomEvent).detail;
      applied.push(data.tasks[0].title);
      // The real App replaces React state and schedules persistence on this event.
      scheduleStorageWrite("aero_todos", data.tasks);
    });
    try {
      scheduleStorageWrite("aero_todos", [{ ...oldTask, title: "new" }]);
      engine.markDirty("tasks");
      release();
      await sync;
    } finally {
      flushPendingStorage();
      vi.unstubAllGlobals();
    }
    expect(uploaded).toEqual(["old", "new"]);
    expect(applied).toEqual(["new"]);
    expect(engine.dirty).toBe(false);
    expect(engine.status).toBe("success");
  });

  it("flushes delayed journal persistence before building the upload snapshot", async () => {
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    engine.setBackend("webdav");
    vi.spyOn(engine.webdavProvider, "isConfigured").mockReturnValue(true);
    vi.spyOn(engine.webdavProvider, "pull").mockResolvedValue(null);
    const entry = {
      id: "j",
      content: "latest text",
      title: "today",
      date: "2026-11-04",
      isDaily: true,
    };
    const unregister = registerPersistenceFlusher(() => {
      localStorage.setItem("tongyun_journal", JSON.stringify([entry]));
    });
    const push = vi.spyOn(engine.webdavProvider, "push").mockResolvedValue({ conflicts: [] });
    try {
      engine.markDirty("journal");
      await engine.sync();
      expect(push.mock.calls[0][0].journal[0].content).toBe("latest text");
    } finally {
      unregister();
    }
  });
  it("keeps edits made during a forced local upload and syncs them afterward", async () => {
    const { SyncEngine } = await import("../engine");
    const engine = new SyncEngine();
    engine.setBackend("webdav");
    vi.spyOn(engine.webdavProvider, "isConfigured").mockReturnValue(true);
    vi.spyOn(engine.webdavProvider, "pull").mockResolvedValue(null);
    localStorage.setItem("aero_todos", JSON.stringify([{ id: "t", title: "old" }]));
    vi.spyOn(engine.webdavProvider, "uploadCategory").mockImplementation(async () => {
      localStorage.setItem("aero_todos", JSON.stringify([{ id: "t", title: "new" }]));
      engine.markDirty("tasks");
    });
    const push = vi.spyOn(engine.webdavProvider, "push").mockResolvedValue({ conflicts: [] });
    engine.markDirty("tasks");
    await engine.resolveConflicts("local");
    expect(push.mock.calls[0][0].tasks[0].title).toBe("new");
    expect(engine.dirty).toBe(false);
  });
});

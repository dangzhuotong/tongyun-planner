import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
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

let mock: LocalStorageMock;
let StorageManager: typeof import("./manager").StorageManager;

const STORAGE_KEY = "tongyun_storage_backend";

beforeAll(async () => {
  mock = new LocalStorageMock();
  (globalThis as unknown as { localStorage: Storage }).localStorage = mock as unknown as Storage;
  ({ StorageManager } = await import("./manager"));
});

beforeEach(() => {
  mock.clear();
});

describe("StorageManager", () => {
  it("defaults to the local backend", () => {
    const manager = new StorageManager();
    expect(manager.current).toBe("local");
    expect(manager.provider.type).toBe("local");
    expect(manager.status).toBe("idle");
  });

  it("restores a saved webdav preference", () => {
    mock.setItem(STORAGE_KEY, "webdav");
    const manager = new StorageManager();
    expect(manager.current).toBe("webdav");
    expect(manager.provider.type).toBe("webdav");
  });

  it("migrates a legacy supabase preference to local", () => {
    mock.setItem(STORAGE_KEY, "supabase");
    expect(new StorageManager().current).toBe("local");
  });

  it("ignores an unknown saved backend", () => {
    mock.setItem(STORAGE_KEY, "dropbox");
    expect(new StorageManager().current).toBe("local");
  });

  it("lists the local and webdav providers", () => {
    const manager = new StorageManager();
    const types = manager.allProviders().map(([type]) => type);
    expect(types).toEqual(["local", "webdav"]);
  });

  it("switches backend, persists the choice, and notifies subscribers", () => {
    const manager = new StorageManager();
    const seen: string[] = [];
    const unsubscribe = manager.subscribe((current) => seen.push(current));

    manager.setBackend("webdav");
    expect(manager.current).toBe("webdav");
    expect(mock.getItem(STORAGE_KEY)).toBe("webdav");
    expect(seen).toEqual(["webdav"]);

    unsubscribe();
    manager.setBackend("local");
    expect(manager.current).toBe("local");
    expect(seen).toEqual(["webdav"]);
  });

  it("rejects an unknown backend", () => {
    const manager = new StorageManager();
    expect(() => manager.setBackend("ftp" as never)).toThrow(/Unknown storage backend/);
  });

  it("delegates configuration checks and test() to the active provider", async () => {
    const manager = new StorageManager();
    expect(manager.isConfigured()).toBe(false);
    await expect(manager.test()).resolves.toBe(false);
  });

  it("delegates text reads and writes to the active provider", async () => {
    const manager = new StorageManager();
    const write = vi.spyOn(manager.local, "writeText").mockResolvedValue(undefined);
    const read = vi.spyOn(manager.local, "readText").mockResolvedValue("payload");

    await manager.writeText("data/tasks.json", "payload");
    await expect(manager.readText("data/tasks.json")).resolves.toBe("payload");

    expect(write).toHaveBeenCalledWith("data/tasks.json", "payload");
    expect(read).toHaveBeenCalledWith("data/tasks.json");
  });

  it("resets status to idle after a failed write", async () => {
    const manager = new StorageManager();
    vi.spyOn(manager.local, "writeText").mockRejectedValue(new Error("disk full"));

    await expect(manager.writeText("data/tasks.json", "payload")).rejects.toThrow("disk full");
    expect(manager.status).toBe("idle");
  });
});

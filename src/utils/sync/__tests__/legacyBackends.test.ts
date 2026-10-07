import { describe, it, expect, beforeEach } from "vitest";
import { detectLegacySyncBackend, clearLegacySyncBackend } from "../legacyBackends";

// Minimal in-memory localStorage stub for node environment
class LocalStorageStub implements Storage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

const stub = new LocalStorageStub();

Object.defineProperty(globalThis, "localStorage", {
  value: stub,
  writable: true,
  configurable: true,
});

describe("legacyBackends", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("detectLegacySyncBackend", () => {
    it("returns null when no legacy config is present", () => {
      expect(detectLegacySyncBackend()).toBeNull();
    });

    it("returns 'supabase' when tongyun_sync_backend is 'supabase'", () => {
      localStorage.setItem("tongyun_sync_backend", "supabase");
      expect(detectLegacySyncBackend()).toBe("supabase");
    });

    it("returns 'http' when tongyun_sync_backend is 'http'", () => {
      localStorage.setItem("tongyun_sync_backend", "http");
      expect(detectLegacySyncBackend()).toBe("http");
    });

    it("returns 'supabase' when tongyun_storage_backend is 'supabase'", () => {
      localStorage.setItem("tongyun_storage_backend", "supabase");
      expect(detectLegacySyncBackend()).toBe("supabase");
    });

    it("returns 'supabase' when tongyun_supabase_url is non-empty", () => {
      localStorage.setItem("tongyun_supabase_url", "https://xyz.supabase.co");
      expect(detectLegacySyncBackend()).toBe("supabase");
    });

    it("returns 'supabase' when tongyun_supabase_anon_key is non-empty", () => {
      localStorage.setItem("tongyun_supabase_anon_key", "anon-key-123");
      expect(detectLegacySyncBackend()).toBe("supabase");
    });

    it("returns 'http' when both tongyun_http_sync_url and tongyun_http_sync_key are non-empty", () => {
      localStorage.setItem("tongyun_http_sync_url", "http://127.0.0.1:8787");
      localStorage.setItem("tongyun_http_sync_key", "secret-key");
      expect(detectLegacySyncBackend()).toBe("http");
    });

    it("returns 'http' when tongyun_http_sync_url is set even if key is missing", () => {
      localStorage.setItem("tongyun_http_sync_url", "http://127.0.0.1:8787");
      expect(detectLegacySyncBackend()).toBe("http");
    });

    it("returns 'http' when tongyun_http_sync_key is set even if url is missing", () => {
      localStorage.setItem("tongyun_http_sync_key", "secret-key");
      expect(detectLegacySyncBackend()).toBe("http");
    });

    it("returns null when sync_backend is webdav and storage_backend is local with no legacy keys", () => {
      localStorage.setItem("tongyun_sync_backend", "webdav");
      localStorage.setItem("tongyun_storage_backend", "local");
      localStorage.setItem("tongyun_webdav_url", "https://dav.jianguoyun.com/dav/");
      expect(detectLegacySyncBackend()).toBeNull();
    });
  });

  describe("clearLegacySyncBackend", () => {
    it("clears legacy keys and resets sync/storage backends", () => {
      localStorage.setItem("tongyun_sync_backend", "supabase");
      localStorage.setItem("tongyun_storage_backend", "supabase");
      localStorage.setItem("tongyun_supabase_url", "https://xyz.supabase.co");
      localStorage.setItem("tongyun_supabase_anon_key", "key123");
      localStorage.setItem("tongyun_supabase_user_id", "user123");
      localStorage.setItem("tongyun_http_sync_url", "http://localhost:8787");
      localStorage.setItem("tongyun_http_sync_key", "key456");

      clearLegacySyncBackend();

      expect(localStorage.getItem("tongyun_supabase_url")).toBeNull();
      expect(localStorage.getItem("tongyun_supabase_anon_key")).toBeNull();
      expect(localStorage.getItem("tongyun_supabase_user_id")).toBeNull();
      expect(localStorage.getItem("tongyun_http_sync_url")).toBeNull();
      expect(localStorage.getItem("tongyun_http_sync_key")).toBeNull();
      expect(localStorage.getItem("tongyun_sync_backend")).toBe("none");
      expect(localStorage.getItem("tongyun_storage_backend")).toBe("local");
      expect(detectLegacySyncBackend()).toBeNull();
    });

    it("resets http sync backend to none without altering webdav storage", () => {
      localStorage.setItem("tongyun_sync_backend", "http");
      localStorage.setItem("tongyun_storage_backend", "webdav");
      localStorage.setItem("tongyun_http_sync_url", "http://localhost:8787");
      localStorage.setItem("tongyun_http_sync_key", "key456");

      clearLegacySyncBackend();

      expect(localStorage.getItem("tongyun_sync_backend")).toBe("none");
      expect(localStorage.getItem("tongyun_storage_backend")).toBe("webdav");
      expect(detectLegacySyncBackend()).toBeNull();
    });

    it("leaves webdav sync backend untouched", () => {
      localStorage.setItem("tongyun_sync_backend", "webdav");
      localStorage.setItem("tongyun_storage_backend", "local");
      localStorage.setItem("tongyun_supabase_url", "https://old.supabase.co");

      clearLegacySyncBackend();

      expect(localStorage.getItem("tongyun_sync_backend")).toBe("webdav");
      expect(localStorage.getItem("tongyun_supabase_url")).toBeNull();
      expect(detectLegacySyncBackend()).toBeNull();
    });
  });
});

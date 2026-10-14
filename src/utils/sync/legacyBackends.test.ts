import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectLegacySyncBackend, clearLegacySyncBackend } from "./legacyBackends";

describe("legacyBackends utils", () => {
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
  });

  describe("detectLegacySyncBackend", () => {
    it("should return null when no legacy backends are configured", () => {
      expect(detectLegacySyncBackend()).toBeNull();
    });

    it("should detect supabase when tongyun_sync_backend is supabase", () => {
      mockStore["tongyun_sync_backend"] = "supabase";
      expect(detectLegacySyncBackend()).toBe("supabase");
    });

    it("should detect http when tongyun_sync_backend is http", () => {
      mockStore["tongyun_sync_backend"] = "http";
      expect(detectLegacySyncBackend()).toBe("http");
    });

    it("should detect supabase when supabase url/key exists", () => {
      mockStore["tongyun_supabase_url"] = "https://xyz.supabase.co";
      expect(detectLegacySyncBackend()).toBe("supabase");
    });

    it("should detect http when http sync url/key exists", () => {
      mockStore["tongyun_http_sync_url"] = "https://sync.example.com";
      expect(detectLegacySyncBackend()).toBe("http");
    });
  });

  describe("clearLegacySyncBackend", () => {
    it("should remove all legacy credentials and reset backend to none / local", () => {
      mockStore["tongyun_supabase_url"] = "https://xyz.supabase.co";
      mockStore["tongyun_supabase_anon_key"] = "anon_key";
      mockStore["tongyun_sync_backend"] = "supabase";
      mockStore["tongyun_storage_backend"] = "supabase";

      clearLegacySyncBackend();

      expect(mockStore["tongyun_supabase_url"]).toBeUndefined();
      expect(mockStore["tongyun_supabase_anon_key"]).toBeUndefined();
      expect(mockStore["tongyun_sync_backend"]).toBe("none");
      expect(mockStore["tongyun_storage_backend"]).toBe("local");
    });
  });
});

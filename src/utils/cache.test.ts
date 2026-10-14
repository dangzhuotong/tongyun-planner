import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCachedData, setCachedData, clearCache, fetchWithRetry } from "./cache";

describe("cache utils", () => {
  const mockStore: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
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

  describe("setCachedData & getCachedData", () => {
    it("should store and retrieve data within TTL", () => {
      setCachedData("test_key", { msg: "hello" });
      const retrieved = getCachedData<{ msg: string }>("test_key", 1000);
      expect(retrieved).toEqual({ msg: "hello" });
    });

    it("should return null and clean up when TTL has expired", () => {
      setCachedData("expired_key", "old");
      // Advance time by 2000ms
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now + 2000);

      const retrieved = getCachedData<string>("expired_key", 1000);
      expect(retrieved).toBeNull();
      expect(mockStore["tongyun_cache_expired_key"]).toBeUndefined();

      vi.restoreAllMocks();
    });

    it("should return null for non-existent key", () => {
      expect(getCachedData("missing_key", 1000)).toBeNull();
    });
  });

  describe("clearCache", () => {
    it("should remove single key when specified", () => {
      setCachedData("k1", "v1");
      setCachedData("k2", "v2");
      clearCache("k1");
      expect(getCachedData("k1", 1000)).toBeNull();
      expect(getCachedData("k2", 1000)).toBe("v2");
    });

    it("should clear all cache items with prefix when no key specified", () => {
      setCachedData("a", 1);
      setCachedData("b", 2);
      mockStore["unrelated_key"] = "keep_me";

      clearCache();

      expect(getCachedData("a", 1000)).toBeNull();
      expect(getCachedData("b", 1000)).toBeNull();
      expect(mockStore["unrelated_key"]).toBe("keep_me");
    });
  });

  describe("fetchWithRetry", () => {
    it("should return result immediately if fetcher succeeds on first try", async () => {
      const fetcher = vi.fn().mockResolvedValue("success");
      const res = await fetchWithRetry(fetcher, 2, 10);
      expect(res).toBe("success");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and return result when subsequent try succeeds", async () => {
      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockResolvedValueOnce("recovered");

      const res = await fetchWithRetry(fetcher, 2, 10);
      expect(res).toBe("recovered");
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("should throw the error when all retries are exhausted", async () => {
      const error = new Error("fatal network error");
      const fetcher = vi.fn().mockRejectedValue(error);

      await expect(fetchWithRetry(fetcher, 2, 10)).rejects.toThrow("fatal network error");
      expect(fetcher).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });
});

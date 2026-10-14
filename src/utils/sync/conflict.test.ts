import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeEtag,
  remoteFingerprint,
  loadFingerprints,
  getFingerprint,
  setFingerprint,
  clearFingerprints,
  isRemoteChanged,
  conflictBackupFileName,
} from "./conflict";

describe("sync conflict utilities", () => {
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

  describe("normalizeEtag", () => {
    it("should return null for null, undefined, or empty etags", () => {
      expect(normalizeEtag(null)).toBeNull();
      expect(normalizeEtag(undefined)).toBeNull();
      expect(normalizeEtag("")).toBeNull();
      expect(normalizeEtag('  ""  ')).toBeNull();
    });

    it("should strip weak prefix W/ and surrounding quotes", () => {
      expect(normalizeEtag('W/"12345"')).toBe("12345");
      expect(normalizeEtag('"abcdef"')).toBe("abcdef");
      expect(normalizeEtag('w/"xyz"')).toBe("xyz");
      expect(normalizeEtag('"""quoted"""')).toBe("quoted");
    });
  });

  describe("remoteFingerprint", () => {
    it("should return null if file does not exist on remote", () => {
      expect(remoteFingerprint(null)).toBeNull();
      expect(remoteFingerprint({ exists: false })).toBeNull();
    });

    it("should prioritize ETag over Last-Modified and manifest version", () => {
      const meta = {
        exists: true,
        etag: '"tag-123"',
        lastModified: "Mon, 28 Sep 2026 08:30:00 GMT",
      };
      expect(remoteFingerprint(meta, 1720000000)).toBe("etag:tag-123");
    });

    it("should fall back to Last-Modified when ETag is absent", () => {
      const meta = {
        exists: true,
        etag: null,
        lastModified: "Mon, 28 Sep 2026 08:30:00 GMT",
      };
      expect(remoteFingerprint(meta, 1720000000)).toBe("lm:Mon, 28 Sep 2026 08:30:00 GMT");
    });

    it("should fall back to manifest version when both ETag and Last-Modified are absent", () => {
      const meta = { exists: true, etag: null, lastModified: null };
      expect(remoteFingerprint(meta, 1720000000)).toBe("v:1720000000");
    });
  });

  describe("fingerprint store operations", () => {
    it("should store and retrieve fingerprints for matching account", () => {
      setFingerprint("user@example.com", "tasks.json", "etag:123");
      expect(getFingerprint("user@example.com", "tasks.json")).toBe("etag:123");
      expect(getFingerprint("user@example.com", "notes.json")).toBeUndefined();
    });

    it("should return empty object when account does not match", () => {
      setFingerprint("user1@example.com", "tasks.json", "etag:123");
      expect(loadFingerprints("user2@example.com")).toEqual({});
      expect(getFingerprint("user2@example.com", "tasks.json")).toBeUndefined();
    });

    it("should clear fingerprints", () => {
      setFingerprint("user@example.com", "tasks.json", "etag:123");
      clearFingerprints();
      expect(loadFingerprints("user@example.com")).toEqual({});
    });
  });

  describe("isRemoteChanged", () => {
    it("should return false if remote does not exist or current fingerprint is null", () => {
      expect(isRemoteChanged("etag:1", "etag:2", false)).toBe(false);
      expect(isRemoteChanged("etag:1", null, true)).toBe(false);
    });

    it("should return true if known fingerprint is undefined (never synced before)", () => {
      expect(isRemoteChanged(undefined, "etag:1", true)).toBe(true);
    });

    it("should compare known and current fingerprints accurately", () => {
      expect(isRemoteChanged("etag:1", "etag:1", true)).toBe(false);
      expect(isRemoteChanged("etag:1", "etag:2", true)).toBe(true);
    });
  });

  describe("conflictBackupFileName", () => {
    it("should generate formatted backup filename with local timestamp and side", () => {
      const d = new Date(2026, 8, 27, 15, 30, 12); // 2026-09-27 15:30:12
      const filename = conflictBackupFileName(d, "tasks", "remote");
      expect(filename).toBe("20260927-153012-tasks-remote.json");

      const localFilename = conflictBackupFileName(d, "notes", "local");
      expect(localFilename).toBe("20260927-153012-notes-local.json");
    });
  });
});

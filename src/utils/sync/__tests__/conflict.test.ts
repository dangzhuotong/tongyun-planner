import { describe, it, expect, beforeEach } from "vitest";
import {
  remoteFingerprint,
  loadFingerprints,
  getFingerprint,
  setFingerprint,
  clearFingerprints,
  isRemoteChanged,
  conflictBackupFileName,
} from "../conflict";

// Stub localStorage on globalThis for node test environment
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

describe("conflict.ts pure helpers", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new LocalStorageMock();
  });

  describe("remoteFingerprint", () => {
    it("returns null if meta is null or exists is false", () => {
      expect(remoteFingerprint(null)).toBeNull();
      expect(remoteFingerprint({ exists: false, etag: "abc" })).toBeNull();
      expect(remoteFingerprint({ exists: false, lastModified: "Mon, 01 Jan 2026 00:00:00 GMT" })).toBeNull();
    });

    it("prefers etag over lastModified and manifestVersion", () => {
      const meta = {
        exists: true,
        etag: '"tag-123"',
        lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
      };
      expect(remoteFingerprint(meta, 9999)).toBe("etag:tag-123");
    });

    it("falls back to lastModified if etag is missing/falsy", () => {
      const meta = {
        exists: true,
        etag: null,
        lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
      };
      expect(remoteFingerprint(meta, 9999)).toBe("lm:Mon, 01 Jan 2026 00:00:00 GMT");
    });

    it("normalizes weak and quoted etags so HEAD/GET/PROPFIND formats compare equal", () => {
      const a = remoteFingerprint({ exists: true, etag: 'W/"abc"' });
      const b = remoteFingerprint({ exists: true, etag: '"abc"' });
      const c = remoteFingerprint({ exists: true, etag: "abc" });
      expect(a).toBe("etag:abc");
      expect(b).toBe(a);
      expect(c).toBe(a);
    });

    it("falls back to v:manifestVersion if etag and lastModified are missing", () => {
      const meta = {
        exists: true,
        etag: null,
        lastModified: null,
      };
      expect(remoteFingerprint(meta, 1720000000000)).toBe("v:1720000000000");
    });

    it("returns null if meta exists but no etag, lastModified or manifestVersion", () => {
      const meta = {
        exists: true,
        etag: null,
        lastModified: null,
      };
      expect(remoteFingerprint(meta)).toBeNull();
      expect(remoteFingerprint(meta, 0)).toBeNull();
    });
  });

  describe("fingerprint store persistence in localStorage", () => {
    const account1 = "https://dav.jianguoyun.com/dav/|user1@test.com";
    const account2 = "https://dav.jianguoyun.com/dav/|user2@test.com";

    it("returns empty object if no stored data or corrupted", () => {
      expect(loadFingerprints(account1)).toEqual({});
      localStorage.setItem("tongyun_webdav_fp", "invalid json");
      expect(loadFingerprints(account1)).toEqual({});
    });

    it("returns empty object if stored account differs", () => {
      setFingerprint(account1, "tasks.json", "fp-1");
      expect(loadFingerprints(account2)).toEqual({});
      expect(getFingerprint(account2, "tasks.json")).toBeUndefined();
    });

    it("stores and retrieves fingerprints per account and file", () => {
      setFingerprint(account1, "tasks.json", "fp-tasks");
      setFingerprint(account1, "notes.json", "fp-notes");

      expect(getFingerprint(account1, "tasks.json")).toBe("fp-tasks");
      expect(getFingerprint(account1, "notes.json")).toBe("fp-notes");
      expect(getFingerprint(account1, "journal.json")).toBeUndefined();

      expect(loadFingerprints(account1)).toEqual({
        "tasks.json": "fp-tasks",
        "notes.json": "fp-notes",
      });
    });

    it("clears fingerprints", () => {
      setFingerprint(account1, "tasks.json", "fp-tasks");
      expect(getFingerprint(account1, "tasks.json")).toBe("fp-tasks");

      clearFingerprints();
      expect(getFingerprint(account1, "tasks.json")).toBeUndefined();
      expect(loadFingerprints(account1)).toEqual({});
    });
  });

  describe("isRemoteChanged", () => {
    it("returns false if remote does not exist", () => {
      expect(isRemoteChanged(undefined, "fp-1", false)).toBe(false);
      expect(isRemoteChanged("fp-1", "fp-2", false)).toBe(false);
    });

    it("returns false if currentFp is null (cannot detect)", () => {
      expect(isRemoteChanged("fp-1", null, true)).toBe(false);
      expect(isRemoteChanged(undefined, null, true)).toBe(false);
    });

    it("returns true if knownFp is undefined and remote exists", () => {
      expect(isRemoteChanged(undefined, "fp-remote", true)).toBe(true);
    });

    it("returns true if knownFp !== currentFp", () => {
      expect(isRemoteChanged("fp-old", "fp-new", true)).toBe(true);
    });

    it("returns false if knownFp === currentFp", () => {
      expect(isRemoteChanged("fp-same", "fp-same", true)).toBe(false);
    });
  });

  describe("conflictBackupFileName", () => {
    it("formats local time with zero padding matching [A-Za-z0-9._-]+", () => {
      const date = new Date(2026, 8, 27, 15, 30, 12); // September is month 8 (0-indexed)
      const fileNameRemote = conflictBackupFileName(date, "tasks", "remote");
      expect(fileNameRemote).toBe("20260927-153012-tasks-remote.json");
      expect(/^[A-Za-z0-9._-]+\.json$/.test(fileNameRemote)).toBe(true);

      const fileNameLocal = conflictBackupFileName(date, "config", "local");
      expect(fileNameLocal).toBe("20260927-153012-config-local.json");
      expect(/^[A-Za-z0-9._-]+\.json$/.test(fileNameLocal)).toBe(true);

      // Single-digit hours/minutes/seconds/month/day
      const earlyDate = new Date(2026, 0, 5, 4, 3, 2); // Jan 5, 2026 04:03:02
      expect(conflictBackupFileName(earlyDate, "notes", "remote")).toBe("20260105-040302-notes-remote.json");
    });
  });
});

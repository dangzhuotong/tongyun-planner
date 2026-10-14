import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DAILY_SNAPSHOT_KEEP,
  CONFLICT_BACKUP_KEEP,
  dailySnapshotFileName,
  buildSnapshotPayload,
  ensureDailySnapshot,
  listDailySnapshots,
  readDailySnapshot,
  getBackupDir,
} from "./localSnapshots";

describe("localSnapshots utils", () => {
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

    if (typeof window !== "undefined") {
      delete (window as any).__TAURI_INTERNALS__;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should export snapshot retention constants", () => {
    expect(DAILY_SNAPSHOT_KEEP).toBe(14);
    expect(CONFLICT_BACKUP_KEEP).toBe(100);
  });

  describe("dailySnapshotFileName", () => {
    it("should format snapshot filename with zero-padded year, month, and day", () => {
      const date = new Date(2026, 4, 3); // May 3, 2026
      expect(dailySnapshotFileName(date)).toBe("tongyun-daily-2026-05-03.json");

      const dateDec = new Date(2026, 11, 25); // Dec 25, 2026
      expect(dailySnapshotFileName(dateDec)).toBe("tongyun-daily-2026-12-25.json");
    });
  });

  describe("buildSnapshotPayload", () => {
    it("should build snapshot payload with sanitized config and ISO export timestamp", () => {
      mockStore["aero_customization_config"] = JSON.stringify({
        aiProvider: "openai",
        aiApiKey: "sk-secret-key-do-not-leak",
        aiModel: "gpt-4o",
      });
      mockStore["tongyun_ai_praise"] = JSON.stringify(["Nice job!"]);

      const now = new Date(2026, 9, 15, 12, 0, 0);
      const payload = buildSnapshotPayload(now, "daily");

      expect(payload.snapshotType).toBe("daily");
      expect(payload.exportedAt).toBe(now.toISOString());
      expect(payload.aiPraise).toEqual(["Nice job!"]);

      // Verify sensitive api key is stripped by sanitizeConfigForSync
      const config = payload.customizationConfig as Record<string, unknown>;
      expect(config.aiModel).toBe("gpt-4o");
      expect(config.aiApiKey).toBeUndefined();
    });

    it("should omit snapshotType when not specified", () => {
      const now = new Date(2026, 9, 15, 12, 0, 0);
      const payload = buildSnapshotPayload(now);

      expect(payload.snapshotType).toBeUndefined();
      expect(payload.exportedAt).toBe(now.toISOString());
    });
  });

  describe("Tauri environment guards", () => {
    it("should return null or empty array in non-Tauri browser environments", async () => {
      expect(await ensureDailySnapshot()).toBeNull();
      expect(await listDailySnapshots()).toEqual([]);
      expect(await readDailySnapshot("sample.json")).toBeNull();
      expect(await getBackupDir()).toBeNull();
    });
  });
});

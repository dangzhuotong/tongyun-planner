import { describe, it, expect, beforeEach } from "vitest";
import { dailySnapshotFileName, DAILY_SNAPSHOT_KEEP, buildSnapshotPayload, ensureDailySnapshot } from "../localSnapshots";

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null { return this.store[key] ?? null; }
  setItem(key: string, value: string): void { this.store[key] = String(value); }
  removeItem(key: string): void { delete this.store[key]; }
  clear(): void { this.store = {}; }
}

describe("localSnapshots", () => {
  describe("DAILY_SNAPSHOT_KEEP", () => {
    it("should keep 14 daily snapshots", () => {
      expect(DAILY_SNAPSHOT_KEEP).toBe(14);
    });
  });

  describe("dailySnapshotFileName", () => {
    it("should format single-digit month and day with zero padding", () => {
      // Month index 0 is January, Day 5
      const date = new Date(2026, 0, 5);
      expect(dailySnapshotFileName(date)).toBe("tongyun-daily-2026-01-05.json");
    });

    it("should format single-digit month and two-digit day", () => {
      // Month index 4 is May, Day 21
      const date = new Date(2026, 4, 21);
      expect(dailySnapshotFileName(date)).toBe("tongyun-daily-2026-05-21.json");
    });

    it("should format two-digit month and single-digit day", () => {
      // Month index 9 is October, Day 3
      const date = new Date(2026, 9, 3);
      expect(dailySnapshotFileName(date)).toBe("tongyun-daily-2026-10-03.json");
    });

    it("should format two-digit month and two-digit day", () => {
      // Month index 11 is December, Day 25
      const date = new Date(2026, 11, 25);
      expect(dailySnapshotFileName(date)).toBe("tongyun-daily-2026-12-25.json");
    });

    it("should use local date values instead of UTC", () => {
      const date = new Date(2026, 8, 27, 23, 59, 59);
      const expectedYear = date.getFullYear();
      const expectedMonth = String(date.getMonth() + 1).padStart(2, "0");
      const expectedDay = String(date.getDate()).padStart(2, "0");
      expect(dailySnapshotFileName(date)).toBe(
        `tongyun-daily-${expectedYear}-${expectedMonth}-${expectedDay}.json`
      );
    });

    it("should be a pure function returning consistent results", () => {
      const date = new Date(2026, 6, 15);
      const res1 = dailySnapshotFileName(date);
      const res2 = dailySnapshotFileName(date);
      expect(res1).toBe(res2);
      expect(res1).toBe("tongyun-daily-2026-07-15.json");
    });
  });

  describe("buildSnapshotPayload", () => {
    beforeEach(() => {
      (globalThis as any).localStorage = new LocalStorageMock();
    });

    it("never includes secret config keys (export and daily snapshot)", () => {
      localStorage.setItem("aero_todos", JSON.stringify([{ id: "t1", title: "写周报" }]));
      localStorage.setItem(
        "aero_customization_config",
        JSON.stringify({
          theme: "light",
          aiApiKey: "sk-should-not-leak",
          providerApiKeys: { openai: "sk-x" },
          emailSmtpPassword: "p@ss",
          smtpPass: "smtp-secret-pass",
        })
      );
      for (const snap of [buildSnapshotPayload(), buildSnapshotPayload(new Date(), "daily")]) {
        const json = JSON.stringify(snap);
        expect((snap.tasks as unknown[]).length).toBe(1);
        expect((snap.customizationConfig as any).theme).toBe("light");
        expect(json).not.toContain("sk-should-not-leak");
        expect(json).not.toContain("sk-x");
        expect(json).not.toContain("p@ss");
        expect(json).not.toContain("smtp-secret-pass");
      }
    });

    it("marks only daily snapshots with snapshotType", () => {
      expect(buildSnapshotPayload().snapshotType).toBeUndefined();
      expect(buildSnapshotPayload(new Date(), "daily").snapshotType).toBe("daily");
    });

    it("ensureDailySnapshot is a no-op outside the desktop app", async () => {
      await expect(ensureDailySnapshot()).resolves.toBeNull();
    });
  });
});

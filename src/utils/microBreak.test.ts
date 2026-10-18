import { describe, it, expect, vi } from "vitest";
import {
  MICRO_BREAK_MIN_GAP_SEC,
  MICRO_BREAK_MAX_GAP_SEC,
  MICRO_BREAK_TAIL_SEC,
  MICRO_BREAK_THEMES,
  getRandomMicroBreakTheme,
  getIntervalGaps,
  scheduleMicroBreakThreshold,
  nextThresholdAfterMicroBreak,
  resolveMicroBreakSchedule,
  shouldFireMicroBreak,
  announceMicroBreak,
} from "./microBreak";

describe("microBreak utils", () => {
  describe("constants & themes", () => {
    it("should export correct timing constants", () => {
      expect(MICRO_BREAK_MIN_GAP_SEC).toBe(180);
      expect(MICRO_BREAK_MAX_GAP_SEC).toBe(420);
      expect(MICRO_BREAK_TAIL_SEC).toBe(30);
    });

    it("should have 5 predefined micro-break themes with all attributes", () => {
      expect(MICRO_BREAK_THEMES.length).toBe(5);
      const expectedIds = ["water", "look-away", "stretch", "breathe", "eyes"];
      expect(MICRO_BREAK_THEMES.map((t) => t.id)).toEqual(expectedIds);

      for (const theme of MICRO_BREAK_THEMES) {
        expect(theme.title).toBeTruthy();
        expect(theme.actionText).toBeTruthy();
        expect(theme.description).toBeTruthy();
        expect(theme.tip).toBeTruthy();
        expect(theme.emoji).toBeTruthy();
        expect(theme.badgeFrom).toBeTruthy();
        expect(theme.badgeTo).toBeTruthy();
        expect(theme.borderColor).toBeTruthy();
        expect(theme.iconColor).toBeTruthy();
        expect(theme.tapeColor).toBeTruthy();
      }
    });

    it("should get random theme and respect excludeId", () => {
      const theme = getRandomMicroBreakTheme();
      expect(MICRO_BREAK_THEMES).toContainEqual(theme);

      for (let i = 0; i < 20; i++) {
        const themeNoWater = getRandomMicroBreakTheme("water");
        expect(themeNoWater.id).not.toBe("water");
      }
    });
  });

  describe("getIntervalGaps", () => {
    it("should return correct min and max seconds for known keys", () => {
      expect(getIntervalGaps("test-30s")).toEqual({ minSec: 15, maxSec: 30 });
      expect(getIntervalGaps("1-2")).toEqual({ minSec: 60, maxSec: 120 });
      expect(getIntervalGaps("3-5")).toEqual({ minSec: 180, maxSec: 300 });
      expect(getIntervalGaps("5-10")).toEqual({ minSec: 300, maxSec: 600 });
    });

    it("should default to 3-5 range for undefined or unknown keys", () => {
      expect(getIntervalGaps()).toEqual({ minSec: 180, maxSec: 300 });
      expect(getIntervalGaps("unknown")).toEqual({ minSec: 180, maxSec: 300 });
    });
  });

  describe("scheduleMicroBreakThreshold", () => {
    it("should return null if remaining seconds is not greater than tailSec", () => {
      expect(scheduleMicroBreakThreshold(30, () => 0.5, 180, 420, 30)).toBeNull();
      expect(scheduleMicroBreakThreshold(10, () => 0.5, 180, 420, 30)).toBeNull();
      expect(scheduleMicroBreakThreshold(0, () => 0.5, 180, 420, 30)).toBeNull();
    });

    it("should calculate threshold based on rng and gap constraints", () => {
      // 1500 seconds remaining (25 min). tailSec = 30. maxGap = 420, minGap = 180.
      // rng = 0 -> delay = 180 -> threshold = 1500 - 180 = 1320
      const threshMin = scheduleMicroBreakThreshold(1500, () => 0, 180, 420, 30);
      expect(threshMin).toBe(1320);

      // rng = 1 -> delay = 420 -> threshold = 1500 - 420 = 1080
      const threshMax = scheduleMicroBreakThreshold(1500, () => 1, 180, 420, 30);
      expect(threshMax).toBe(1080);
    });

    it("should clamp delay when remainingSec - tailSec is smaller than minGap", () => {
      // remainingSec = 100, tailSec = 30 -> maxDelay = 70, minDelay = 70.
      // threshold = 100 - 70 = 30
      const thresh = scheduleMicroBreakThreshold(100, () => 0.5, 180, 420, 30);
      expect(thresh).toBe(30);
    });
  });

  describe("nextThresholdAfterMicroBreak", () => {
    it("should calculate next threshold based on rng and gap", () => {
      // remainingSec = 1000, rng = 0 -> gap = 180 -> threshold = 820 >= 30
      expect(nextThresholdAfterMicroBreak(1000, () => 0, 180, 420, 30)).toBe(820);
      // rng = 1 -> gap = 420 -> threshold = 580 >= 30
      expect(nextThresholdAfterMicroBreak(1000, () => 1, 180, 420, 30)).toBe(580);
    });

    it("should return -1 when next threshold is less than tailSec", () => {
      // remainingSec = 200, minGap = 180, tailSec = 30 -> threshold = 200 - 180 = 20 < 30 -> -1
      expect(nextThresholdAfterMicroBreak(200, () => 0, 180, 420, 30)).toBe(-1);
    });
  });

  describe("resolveMicroBreakSchedule", () => {
    it("should retain existing positive threshold when enabled and in focus", () => {
      const res = resolveMicroBreakSchedule({
        enabled: true,
        isFocus: true,
        remainingSec: 1200,
        endTime: 100000,
        previous: 1050,
        suppressedForEndTime: null,
        enabledJustTurnedOn: false,
      });
      expect(res).toEqual({ next: 1050, suppressedForEndTime: null });
    });

    it("should schedule a new threshold when previous is null", () => {
      const res = resolveMicroBreakSchedule({
        enabled: true,
        isFocus: true,
        remainingSec: 1500,
        endTime: 100000,
        previous: null,
        suppressedForEndTime: null,
        enabledJustTurnedOn: false,
        rng: () => 0,
        minGapSec: 180,
        maxGapSec: 300,
        tailSec: 30,
      });
      expect(res.next).toBe(1320); // 1500 - 180
      expect(res.suppressedForEndTime).toBeNull();
    });

    it("should clear schedule when disabled or not in focus", () => {
      // previous was negative (-1)
      const res1 = resolveMicroBreakSchedule({
        enabled: false,
        isFocus: true,
        remainingSec: 1500,
        endTime: 100000,
        previous: -1,
        suppressedForEndTime: 100000,
        enabledJustTurnedOn: false,
      });
      expect(res1).toEqual({ next: null, suppressedForEndTime: null });

      // previous was positive
      const res2 = resolveMicroBreakSchedule({
        enabled: true,
        isFocus: false,
        remainingSec: 1500,
        endTime: 100000,
        previous: 1200,
        suppressedForEndTime: null,
        enabledJustTurnedOn: false,
      });
      expect(res2).toEqual({ next: 1200, suppressedForEndTime: null });
    });

    it("should reset stale suppressed threshold (-1) if end time changed or toggle just turned on", () => {
      const res = resolveMicroBreakSchedule({
        enabled: true,
        isFocus: true,
        remainingSec: 1500,
        endTime: 200000,
        previous: -1,
        suppressedForEndTime: 100000, // Different endTime
        enabledJustTurnedOn: false,
        rng: () => 0,
      });
      expect(res.next).toBe(1320);
      expect(res.suppressedForEndTime).toBeNull();
    });
  });

  describe("shouldFireMicroBreak", () => {
    it("should return false if already on break", () => {
      expect(shouldFireMicroBreak(100, 150, true)).toBe(false);
    });

    it("should return false if threshold is null or negative", () => {
      expect(shouldFireMicroBreak(100, null, false)).toBe(false);
      expect(shouldFireMicroBreak(100, -1, false)).toBe(false);
    });

    it("should return false if remainingSec is greater than threshold", () => {
      expect(shouldFireMicroBreak(151, 150, false)).toBe(false);
    });

    it("should return false if remainingSec <= 0", () => {
      expect(shouldFireMicroBreak(0, 150, false)).toBe(false);
      expect(shouldFireMicroBreak(-5, 150, false)).toBe(false);
    });

    it("should return true when remainingSec > 0 and <= threshold", () => {
      expect(shouldFireMicroBreak(150, 150, false)).toBe(true);
      expect(shouldFireMicroBreak(120, 150, false)).toBe(true);
      expect(shouldFireMicroBreak(1, 150, false)).toBe(true);
    });
  });

  describe("announceMicroBreak", () => {
    it("should invoke onToast callback with notice body", () => {
      const onToast = vi.fn();
      announceMicroBreak(
        { title: "Break Time", body: "Drink some water" },
        { onToast },
      );
      expect(onToast).toHaveBeenCalledWith("Drink some water");
    });

    it("should show system notification when permission is granted", () => {
      const mockCtor = vi.fn();
      (mockCtor as any).permission = "granted";

      announceMicroBreak(
        { title: "Break Time", body: "Stretch your arms" },
        { NotificationAPI: mockCtor as any },
      );

      expect(mockCtor).toHaveBeenCalledWith("Break Time", { body: "Stretch your arms" });
    });

    it("should request permission when permission is default and trigger notification on grant", async () => {
      const mockCtor = vi.fn();
      (mockCtor as any).permission = "default";
      (mockCtor as any).requestPermission = vi.fn().mockResolvedValue("granted");

      announceMicroBreak(
        { title: "Break Time", body: "Look far away" },
        { NotificationAPI: mockCtor as any },
      );

      expect((mockCtor as any).requestPermission).toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 10));
      expect(mockCtor).toHaveBeenCalledWith("Break Time", { body: "Look far away" });
    });

    it("should not create notification if permission is denied", () => {
      const mockCtor = vi.fn();
      (mockCtor as any).permission = "denied";

      announceMicroBreak(
        { title: "Break Time", body: "Take a breath" },
        { NotificationAPI: mockCtor as any },
      );

      expect(mockCtor).not.toHaveBeenCalled();
    });
  });
});

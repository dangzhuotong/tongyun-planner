import { describe, expect, it, vi } from "vitest";
import {
  announceMicroBreak,
  nextThresholdAfterMicroBreak,
  resolveMicroBreakSchedule,
  scheduleMicroBreakThreshold,
  shouldFireMicroBreak,
} from "../microBreak";
import { shouldAutoStartNoise, shouldResumeNoiseAfterMicroBreak } from "../noisePolicy";

describe("random micro-breaks", () => {
  it("schedules inside a normal focus block and still schedules a short one", () => {
    expect(scheduleMicroBreakThreshold(1500, () => 0)).toBe(1320);
    expect(scheduleMicroBreakThreshold(1500, () => 1)).toBe(1080);
    expect(scheduleMicroBreakThreshold(60, () => 0)).toBe(30);
    expect(scheduleMicroBreakThreshold(20, () => 0)).toBeNull();
  });

  it("treats a leftover -1 as stale unless it belongs to this same session", () => {
    const stale = resolveMicroBreakSchedule({
      enabled: true,
      isFocus: true,
      remainingSec: 1500,
      endTime: 5_000,
      previous: -1,
      suppressedForEndTime: 1_000,
      enabledJustTurnedOn: false,
      rng: () => 0,
    });
    expect(stale.next).toBe(1320);
    expect(stale.suppressedForEndTime).toBeNull();

    const freshTail = resolveMicroBreakSchedule({
      enabled: true,
      isFocus: true,
      remainingSec: 80,
      endTime: 5_000,
      previous: -1,
      suppressedForEndTime: 5_000,
      enabledJustTurnedOn: false,
    });
    expect(freshTail.next).toBe(-1);
  });

  it("schedules when the toggle turns on mid-session", () => {
    const planned = resolveMicroBreakSchedule({
      enabled: true,
      isFocus: true,
      remainingSec: 900,
      endTime: 9_000,
      previous: -1,
      suppressedForEndTime: 9_000,
      enabledJustTurnedOn: true,
      rng: () => 0,
    });
    expect(planned.next).toBe(720);
  });

  it("fires only for a real future threshold", () => {
    expect(shouldFireMicroBreak(100, 120, false)).toBe(true);
    expect(shouldFireMicroBreak(100, -1, false)).toBe(false);
    expect(shouldFireMicroBreak(0, 10, false)).toBe(false);
    expect(nextThresholdAfterMicroBreak(40, () => 0)).toBe(-1);
    expect(nextThresholdAfterMicroBreak(400, () => 0)).toBe(220);
  });

  it("shows an in-app toast and a system notification", async () => {
    const onToast = vi.fn();
    const created: Array<{ title: string; body?: string }> = [];
    class FakeNotification {
      static permission: NotificationPermission = "granted";
      constructor(title: string, options?: { body?: string }) {
        created.push({ title, body: options?.body });
      }
    }
    announceMicroBreak(
      { title: "微休息", body: "休息 5 秒，看看远处，放松一下眼睛" },
      { onToast, NotificationAPI: FakeNotification as unknown as typeof Notification },
    );
    expect(onToast).toHaveBeenCalledWith("休息 5 秒，看看远处，放松一下眼睛");
    expect(created).toEqual([{ title: "微休息", body: "休息 5 秒，看看远处，放松一下眼睛" }]);

    const requested: string[] = [];
    class AskingNotification {
      static permission: NotificationPermission = "default";
      static requestPermission() {
        AskingNotification.permission = "granted";
        return Promise.resolve("granted" as NotificationPermission);
      }
      constructor(title: string) {
        requested.push(title);
      }
    }
    announceMicroBreak(
      { title: "Micro-break", body: "Rest for 5 seconds" },
      { NotificationAPI: AskingNotification as unknown as typeof Notification },
    );
    await Promise.resolve();
    expect(requested).toEqual(["Micro-break"]);
  });
});

describe("manual noise stop", () => {
  it("blocks auto-noise and micro-break resume until the user starts noise again", () => {
    expect(
      shouldAutoStartNoise({
        autoNoiseEnabled: true,
        active: true,
        isBreak: false,
        manuallyStopped: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartNoise({
        autoNoiseEnabled: true,
        active: true,
        isBreak: false,
        manuallyStopped: false,
      }),
    ).toBe(true);
    expect(
      shouldResumeNoiseAfterMicroBreak({
        wasPlayingNoise: true,
        autoNoiseEnabled: true,
        manuallyStopped: true,
      }),
    ).toBe(false);
    expect(
      shouldResumeNoiseAfterMicroBreak({
        wasPlayingNoise: false,
        autoNoiseEnabled: true,
        manuallyStopped: false,
      }),
    ).toBe(true);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  claimPomodoroCompletion,
  cleanOldPomodoroCompletionLocks,
} from "../pomodoroLock";

describe("pomodoro cross-window completion lock", () => {
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

  it("claims lock on first invocation and denies duplicate claims for the same timer", () => {
    const endTime = Date.now() + 1000;
    const isBreak = false;

    // First window (e.g. widget window) reaches 0
    const firstClaim = claimPomodoroCompletion(endTime, isBreak);
    expect(firstClaim).toBe(true);

    // Second window (e.g. main window wakes up) reaches 0 for the same countdown
    const secondClaim = claimPomodoroCompletion(endTime, isBreak);
    expect(secondClaim).toBe(false);
  });

  it("allows claiming distinct countdowns independently", () => {
    const endTime1 = 1700000000000;
    const endTime2 = 1700001500000;

    expect(claimPomodoroCompletion(endTime1, false)).toBe(true);
    expect(claimPomodoroCompletion(endTime1, true)).toBe(true);
    expect(claimPomodoroCompletion(endTime2, false)).toBe(true);

    // Re-claiming any of them is rejected
    expect(claimPomodoroCompletion(endTime1, false)).toBe(false);
    expect(claimPomodoroCompletion(endTime1, true)).toBe(false);
    expect(claimPomodoroCompletion(endTime2, false)).toBe(false);
  });

  it("safely handles null or undefined endTime", () => {
    expect(claimPomodoroCompletion(null, false)).toBe(true);
    expect(claimPomodoroCompletion(undefined, true)).toBe(true);
  });

  it("cleans up locks older than maxAgeMs and preserves fresh locks", () => {
    const now = Date.now();
    const oldEndTime = now - 5000 * 1000; // 5000s ago (> 3600s)
    const freshEndTime = now - 100 * 1000; // 100s ago

    mockStore[`tongyun_pomo_done_${oldEndTime}_focus`] = String(oldEndTime);
    mockStore[`tongyun_pomo_done_${freshEndTime}_focus`] = String(freshEndTime);
    mockStore["other_unrelated_key"] = "test";

    cleanOldPomodoroCompletionLocks(3600 * 1000);

    expect(mockStore[`tongyun_pomo_done_${oldEndTime}_focus`]).toBeUndefined();
    expect(mockStore[`tongyun_pomo_done_${freshEndTime}_focus`]).toBeDefined();
    expect(mockStore["other_unrelated_key"]).toBe("test");
  });
});

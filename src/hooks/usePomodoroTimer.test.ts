import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => unknown) => {
    effect();
  },
}));
vi.mock("../utils/audioEngine", () => ({
  audioEngine: { playAlert: vi.fn(), stopNoise: vi.fn() },
}));
vi.mock("../utils/pomodoroLock", () => ({ claimPomodoroCompletion: () => true }));
import { usePomodoroTimer } from "./usePomodoroTimer";
import { pomodoroStatsOn } from "../utils/dailyReview";
import { getLocalDateString } from "../utils/date";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("records a completed 25-minute session as 1500 seconds and shows 25 minutes", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 7, 12));
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const addPomodoroLog = vi.fn();
  const hook = new Proxy(
    {
      pomodoroIsActive: true,
      pomodoroEndTime: Date.now() - 1000,
      pomodoroIsBreak: false,
      focusDuration: 25,
      breakDuration: 5,
      pomodoroSessionCount: 0,
      randomBreakEnabled: false,
      addPomodoroLog,
    },
    { get: (obj, key) => (key in obj ? obj[key as keyof typeof obj] : vi.fn()) },
  );
  usePomodoroTimer({
    pomodoroHook: hook,
    locale: "zh-CN",
    windowLabel: "main",
    t: { notification: {} },
    onCelebration: vi.fn(),
  } as unknown as Parameters<typeof usePomodoroTimer>[0]);
  expect(addPomodoroLog).toHaveBeenCalledTimes(1);
  const log = addPomodoroLog.mock.calls[0][0];
  expect(log.duration).toBe(1500);
  expect(pomodoroStatsOn([log], getLocalDateString()).minutes).toBe(25);
});

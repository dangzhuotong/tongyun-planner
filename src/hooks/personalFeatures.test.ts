import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial;
    return [
      state.values[i],
      (next: unknown) => {
        state.values[i] = typeof next === "function" ? next(state.values[i]) : next;
      },
    ];
  },
  useCallback: (f: unknown) => f,
  useMemo: (f: () => unknown) => f(),
  useEffect: (effect: () => unknown) => {
    effect();
  },
}));
import { useCountdown } from "./useCountdown";
import { useHabits } from "./useHabits";
beforeEach(() => {
  state.values = [];
  state.cursor = 0;
  vi.useFakeTimers();
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("retains the lunar calendar option when adding a countdown", () => {
  const hook = useCountdown();
  hook.handleAddCountdown({
    title: "birthday",
    targetDate: "2000-01-01",
    isLunar: true,
  } as Parameters<typeof hook.handleAddCountdown>[0]);
  expect((state.values[0] as any[])[0].isLunar).toBe(true);
});
it("rolls over completed habits while the app stays open overnight", () => {
  vi.setSystemTime(new Date(2026, 10, 7, 23, 59, 30));
  localStorage.setItem(
    "tongyun_habits",
    JSON.stringify([
      { id: "h", name: "read", doneToday: true, lastDoneDate: "2026-11-07", streak: 2 },
    ]),
  );
  useHabits();
  vi.advanceTimersByTime(60000);
  expect((state.values[0] as any[])[0].doneToday).toBe(false);
});
it("marks a habit complete when first clicked on the next day", () => {
  vi.setSystemTime(new Date(2026, 10, 7, 23, 59, 30));
  localStorage.setItem(
    "tongyun_habits",
    JSON.stringify([
      { id: "h", name: "read", doneToday: true, lastDoneDate: "2026-11-07", streak: 2 },
    ]),
  );
  const hook = useHabits();
  vi.setSystemTime(new Date(2026, 10, 8, 0, 0, 1));
  hook.toggleHabit("h");
  expect((state.values[0] as any[])[0]).toMatchObject({
    doneToday: true,
    lastDoneDate: "2026-11-08",
    streak: 3,
  });
});

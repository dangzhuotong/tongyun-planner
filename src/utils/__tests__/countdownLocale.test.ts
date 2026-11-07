import { afterEach, expect, it, vi } from "vitest";
import { getDueDateCountdown } from "../../constants";
afterEach(() => vi.useRealTimers());
it("localizes countdowns without changing their due status", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 7, 10));
  expect(getDueDateCountdown("2026-11-07", undefined, "en")).toMatchObject({
    text: "Due today",
    isToday: true,
  });
  expect(getDueDateCountdown("2026-11-09", undefined, "en")).toMatchObject({
    text: "2d left",
    days: 2,
  });
  expect(getDueDateCountdown("2026-11-06", undefined, "en")).toMatchObject({
    text: "1d overdue",
    isOverdue: true,
  });
  expect(getDueDateCountdown("2026-11-07", "12:00", "en")?.text).toBe("Today 12:00");
  expect(getDueDateCountdown("2026-11-07")?.text).toBe("今天到期");
});

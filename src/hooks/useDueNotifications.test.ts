import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => unknown) => {
    effect();
  },
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => ({}) }));
import { useDueNotifications } from "./useDueNotifications";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(["false", "0", "true"])("respects saved reminder preference %s", (enabled) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 7, 12));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "tongyun_due_remind_enabled" ? enabled : null),
  });
  const notify = vi.fn();
  vi.stubGlobal(
    "Notification",
    Object.assign(
      function (...args: unknown[]) {
        notify(...args);
      },
      { permission: "granted" },
    ),
  );
  useDueNotifications({
    isHydrated: true,
    locale: "zh-CN",
    tasks: [
      {
        id: "t",
        title: "test",
        category: "important-not-urgent",
        dueDate: "2026-11-07",
        dueTime: "12:00",
      },
    ],
    completedTasks: [],
    onOpenTask: vi.fn(),
  });
  expect(notify).toHaveBeenCalledTimes(enabled === "true" ? 1 : 0);
});

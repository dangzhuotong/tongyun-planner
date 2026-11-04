import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../types";
import { parseTaskCompletion } from "../utils/taskCompletion";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  sync: vi.fn(),
  remove: vi.fn(),
  syncActive: vi.fn(),
  syncCompleted: vi.fn(),
}));
vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
  useState: (initial: unknown) => {
    const i = harness.cursor++;
    if (!(i in harness.states)) harness.states[i] = initial;
    return [
      harness.states[i],
      (next: unknown) => {
        harness.states[i] = typeof next === "function" ? next(harness.states[i]) : next;
      },
    ];
  },
}));
vi.mock("./useSync", () => ({ useSync: () => ({ syncState: harness.sync }) }));
vi.mock("../utils/deferredStorage", () => ({ scheduleStorageWrite: vi.fn() }));
vi.mock("../utils/sync/engine", () => ({ syncEngine: { markDirty: vi.fn() } }));
vi.mock("../utils/journalTodoLink", () => ({
  dismissJournalTodo: vi.fn(),
  restoreJournalTodo: vi.fn(),
}));
vi.mock("../data/repositories", () => ({
  taskRepository: {
    syncActive: harness.syncActive,
    syncCompleted: harness.syncCompleted,
    remove: harness.remove,
  },
}));
import { useTasks } from "./useTasks";

const daily: Task = {
  id: "original",
  title: "Read",
  category: "important-not-urgent",
  repeat: "daily",
  dueDate: "2026-11-04",
};
function render(tasks?: Task[], completed?: Task[]) {
  if (tasks) harness.states = [tasks, completed ?? []];
  harness.cursor = 0;
  return useTasks();
}
beforeEach(() => {
  harness.states = [];
  harness.cursor = 0;
  vi.clearAllMocks();
});

describe("task completion persistence and window replay", () => {
  it("replays the sender's exact successor and ignores duplicate completion events", () => {
    render([daily]).handleComplete(daily.id);
    const sender = render();
    const event = harness.sync.mock.calls[0];
    const payload = parseTaskCompletion(event[2], daily.id)!;
    const senderTask = sender.tasks[0];
    harness.sync.mockClear();
    render([daily]).handleComplete(daily.id, false, payload);
    expect(render().tasks).toEqual([senderTask]);
    render().handleComplete(daily.id, false, payload);
    expect(render().tasks).toEqual([senderTask]);
    expect(harness.sync).not.toHaveBeenCalled();
  });

  it("undo removes the successor from storage as well as the visible list", () => {
    render([daily]).handleComplete(daily.id);
    const generatedId = render().tasks[0].id;
    render().handleUndoComplete(daily.id);
    expect(render().tasks.map((t) => t.id)).toEqual([daily.id]);
    expect(render().completedTasks).toEqual([]);
    expect(harness.remove).toHaveBeenCalledWith(generatedId);
    expect(
      harness.syncActive.mock.calls[harness.syncActive.mock.calls.length - 1]?.[0].map(
        (t: Task) => t.id,
      ),
    ).toEqual([daily.id]);
  });

  it("undo and re-complete preserve an edited next occurrence", () => {
    render([daily]).handleComplete(daily.id);
    const completed = render().completedTasks;
    const edited = { ...render().tasks[0], notes: "Keep this work" };
    render([edited], completed).handleUndoComplete(daily.id);
    expect(harness.remove).not.toHaveBeenCalled();
    render().handleComplete(daily.id);
    expect(render().tasks).toEqual([edited]);
  });

  it("re-complete does not recreate a successor already completed", () => {
    render([daily]).handleComplete(daily.id);
    const firstCompleted = render().completedTasks[0];
    const next = render().tasks[0];
    render([], [firstCompleted, { ...next, completedAt: 123 }]).handleUndoComplete(daily.id);
    render().handleComplete(daily.id);
    expect(render().tasks).toEqual([]);
    expect(render().completedTasks.some((t) => t.id === next.id)).toBe(true);
  });
});

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
  scheduleStorageWrite: vi.fn(),
  markDirty: vi.fn(),
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
vi.mock("../utils/deferredStorage", () => ({ scheduleStorageWrite: harness.scheduleStorageWrite }));
vi.mock("../utils/sync/engine", () => ({ syncEngine: { markDirty: harness.markDirty } }));
vi.mock("../utils/journalTodoLink", () => ({
  dismissJournalTodo: vi.fn(),
  restoreJournalTodo: vi.fn(),
}));
vi.mock("../data/repositories", () => ({
  taskRepository: {
    syncActive: harness.syncActive,
    syncCompleted: harness.syncCompleted,
    remove: harness.remove,
    restore: vi.fn(),
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
function RenderTasks(tasks?: Task[], completed?: Task[]) {
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
  it("persists hydration locally without marking either task category dirty", async () => {
    const view = RenderTasks([daily]);
    await view.saveAll([daily], [], false);
    expect(harness.scheduleStorageWrite.mock.calls).toEqual([
      ["aero_todos", [daily]],
      ["aero_completed_todos", []],
    ]);
    expect(harness.syncActive).toHaveBeenCalledWith([daily]);
    expect(harness.syncCompleted).toHaveBeenCalledWith([]);
    expect(harness.markDirty).not.toHaveBeenCalled();

    await view.saveAll([daily], []);
    expect(harness.markDirty).toHaveBeenCalledWith("tasks", "completedTasks");
  });

  it("replays the sender's exact successor and ignores duplicate completion events", () => {
    RenderTasks([daily]).handleComplete(daily.id);
    const sender = RenderTasks();
    const event = harness.sync.mock.calls[0];
    const payload = parseTaskCompletion(event[2], daily.id)!;
    const senderTask = sender.tasks[0];
    harness.sync.mockClear();
    RenderTasks([daily]).handleComplete(daily.id, false, payload);
    expect(RenderTasks().tasks).toEqual([senderTask]);
    RenderTasks().handleComplete(daily.id, false, payload);
    expect(RenderTasks().tasks).toEqual([senderTask]);
    expect(harness.sync).not.toHaveBeenCalled();
  });

  it("undo removes the successor from storage as well as the visible list", () => {
    RenderTasks([daily]).handleComplete(daily.id);
    const generatedId = RenderTasks().tasks[0].id;
    RenderTasks().handleUndoComplete(daily.id);
    expect(RenderTasks().tasks.map((t) => t.id)).toEqual([daily.id]);
    expect(RenderTasks().completedTasks).toEqual([]);
    expect(harness.remove).toHaveBeenCalledWith(generatedId);
    expect(
      harness.syncActive.mock.calls[harness.syncActive.mock.calls.length - 1]?.[0].map(
        (t: Task) => t.id,
      ),
    ).toEqual([daily.id]);
  });

  it("undo and re-complete preserve an edited next occurrence", () => {
    RenderTasks([daily]).handleComplete(daily.id);
    const completed = RenderTasks().completedTasks;
    const edited = { ...RenderTasks().tasks[0], notes: "Keep this work" };
    RenderTasks([edited], completed).handleUndoComplete(daily.id);
    expect(harness.remove).not.toHaveBeenCalled();
    RenderTasks().handleComplete(daily.id);
    expect(RenderTasks().tasks).toEqual([edited]);
  });

  it("re-complete does not recreate a successor already completed", () => {
    RenderTasks([daily]).handleComplete(daily.id);
    const firstCompleted = RenderTasks().completedTasks[0];
    const next = RenderTasks().tasks[0];
    RenderTasks([], [firstCompleted, { ...next, completedAt: 123 }]).handleUndoComplete(daily.id);
    RenderTasks().handleComplete(daily.id);
    expect(RenderTasks().tasks).toEqual([]);
    expect(RenderTasks().completedTasks.some((t) => t.id === next.id)).toBe(true);
  });
});

describe("task deletion persistence and window replay", () => {
  it("persists all journal-linked deletes in one snapshot and event", () => {
    const first = { ...daily, id: "first" };
    const second = { ...daily, id: "second" };
    RenderTasks([first, second, daily]).handleDeleteTasks([first.id, second.id]);

    expect(RenderTasks().tasks).toEqual([daily]);
    expect(harness.scheduleStorageWrite).toHaveBeenCalledWith("aero_todos", [daily]);
    expect(harness.remove.mock.calls).toEqual([[first.id], [second.id]]);
    expect(harness.sync.mock.calls).toEqual([
      [first.id, "delete_batch", JSON.stringify([first.id, second.id])],
    ]);
  });

  it("restores the full completed task in another window without duplicating it", () => {
    const task = { ...daily, completedAt: 123, tags: ["日记"], journalId: "entry" };
    RenderTasks([], [task]).handleDeleteTask(task.id);
    RenderTasks().handleUndoDelete();
    const [id, action, payload] = harness.sync.mock.calls[1];
    expect([id, action]).toEqual([task.id, "restore_deleted"]);

    const restored = JSON.parse(payload);
    const receiver = RenderTasks([], []);
    receiver.restoreDeletedTask(restored.task, restored.wasCompleted);
    receiver.restoreDeletedTask(restored.task, restored.wasCompleted);
    expect(RenderTasks().completedTasks).toEqual([task]);
    expect(RenderTasks().tasks).toEqual([]);
  });
});

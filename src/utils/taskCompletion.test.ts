import { describe, expect, it, vi } from "vitest";
import type { Task } from "../types";
import { completeTask, parseTaskCompletion, undoTaskCompletion } from "./taskCompletion";

const daily: Task = {
  id: "daily",
  title: "Read",
  category: "important-not-urgent",
  repeat: "daily",
  dueDate: "2026-11-04",
};

describe("repeating task completion", () => {
  it("generates one stable successor across windows and successive occurrences", () => {
    const first = completeTask(daily, 100);
    const second = completeTask(daily, 200);
    expect(first.successor?.id).toBe(second.successor?.id);
    expect(first.successor?.dueDate).toBe("2026-11-05");
    const third = completeTask(first.successor!, 300);
    expect(third.successor?.id).toBe("daily::repeat::2026-11-06");
    expect(third.successor?.repeatSuccessor).toBeUndefined();
  });

  it("serializes exactly the same completion and successor to the receiving window", () => {
    const completion = completeTask(daily, 100);
    expect(parseTaskCompletion(JSON.stringify(completion), daily.id)).toEqual(completion);
    expect(parseTaskCompletion("invalid", daily.id)).toBeUndefined();
    expect(parseTaskCompletion(JSON.stringify(completion), "another")).toBeUndefined();
    expect(parseTaskCompletion(JSON.stringify({ completed: daily }), daily.id)).toBeUndefined();
  });

  it("undo retracts only the unedited generated successor and restores the original", () => {
    const completion = completeTask(daily, 100);
    const other = { ...daily, id: "other" };
    const result = undoTaskCompletion(completion.completed, [completion.successor!, other]);
    expect(result.map((t) => t.id)).toEqual(["daily", "other"]);
    expect(result[0].completedAt).toBeUndefined();
    expect(result[0].repeatSuccessor).toBeUndefined();
  });

  it("undo preserves a successor edited by the user", () => {
    const completion = completeTask(daily, 100);
    const edited = { ...completion.successor!, notes: "New notes" };
    expect(undoTaskCompletion(completion.completed, [edited])).toContainEqual(edited);
    const withSubtask = {
      ...completion.successor!,
      subtasks: [{ id: "sub", title: "Work", completed: true }],
    };
    expect(undoTaskCompletion(completion.completed, [withSubtask])).toContainEqual(withSubtask);
  });

  it("undo still retracts the unchanged successor after JSON export and SQLite defaults", () => {
    const completion = completeTask(daily, 100);
    const reloaded = JSON.parse(JSON.stringify(completion)) as typeof completion;
    const row: Task = {
      ...reloaded.successor!,
      updatedAt: 500,
      priority: "medium",
      isFavorite: false,
      isPinned: false,
      assigneeKind: "human",
      subtasks: [],
      tags: [],
      dependsOn: [],
      attachments: [],
    };
    expect(undoTaskCompletion(reloaded.completed, [row])).toHaveLength(1);
  });

  it("does not remove an already completed successor or unrelated legacy tasks", () => {
    const completion = completeTask(daily, 100);
    expect(undoTaskCompletion(completion.completed, [])).toHaveLength(1);
    const legacy = { ...daily, completedAt: 100 };
    expect(undoTaskCompletion(legacy, [completion.successor!])).toHaveLength(2);
  });

  it("handles one-shot tasks and monthly anchors", () => {
    expect(completeTask({ ...daily, repeat: "none" }, 100).successor).toBeUndefined();
    const monthly = completeTask({ ...daily, repeat: "monthly", dueDate: "2026-01-31" }, 100);
    expect(monthly.successor?.dueDate).toBe("2026-02-28");
    expect(monthly.successor?.repeatAnchorDay).toBe(31);
  });

  it("undo then re-complete reuses the same next occurrence", () => {
    vi.spyOn(Date, "now").mockReturnValue(200);
    try {
      const first = completeTask(daily, 100);
      const [restored] = undoTaskCompletion(first.completed, [first.successor!]);
      expect(completeTask(restored, 300).successor?.id).toBe(first.successor?.id);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

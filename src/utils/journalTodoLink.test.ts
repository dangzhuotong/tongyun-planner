import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDismissedJournalTodos,
  dismissJournalTodo,
  isJournalTodoDismissed,
  restoreJournalTodo,
} from "./journalTodoLink";

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

describe("journalTodoLink", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      new LocalStorageMock() as unknown as Storage;
  });

  it("remembers a deleted generated diary task by journal id and date", () => {
    dismissJournalTodo({
      journalId: "journal-1",
      title: "日记 2026-10-25",
      tags: ["日记"],
    });

    expect(isJournalTodoDismissed("journal-1", "2026-10-25")).toBe(true);
    expect(isJournalTodoDismissed("journal-2", "2026-10-25")).toBe(true);
    expect(isJournalTodoDismissed("journal-2", "2026-10-26")).toBe(false);
  });

  it("undo restores the day so the switch can create it again", () => {
    const task = { journalId: "journal-1", title: "日记 2026-10-25", tags: ["日记"] };
    dismissJournalTodo(task);
    restoreJournalTodo(task);
    expect(isJournalTodoDismissed("journal-1", "2026-10-25")).toBe(false);
  });

  it("does not dismiss an ordinary task", () => {
    dismissJournalTodo({ title: "发 X《二十四年，半部技术史》", tags: ["自媒体"] });
    expect(isJournalTodoDismissed("journal-1", "2026-10-25")).toBe(false);
  });

  it("clears every dismissal when the feature is turned back on", () => {
    dismissJournalTodo({ title: "日记 2026-10-25", tags: ["日记"] });
    clearDismissedJournalTodos();
    expect(isJournalTodoDismissed("journal-1", "2026-10-25")).toBe(false);
  });
});

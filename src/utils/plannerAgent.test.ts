import { expect, it, vi } from "vitest";
import { executePlannerAgent, type PlannerAgentStore } from "./plannerAgent";

function fixture() {
  const store = {
    tasks: [],
    completed: [],
    notes: [],
    journal: [],
    addTask: vi.fn(),
    addNote: vi.fn(() => "note-id"),
    addJournal: vi.fn(),
  } satisfies PlannerAgentStore;
  return store;
}

it("dispatches only narrow, validated creates and refuses unexpected or dangerous fields", () => {
  const store = fixture();
  expect(
    executePlannerAgent(store, "create_task", { title: "  Meeting  ", dueDate: "2028-02-29" }),
  ).toMatchObject({ status: "ok" });
  expect(store.addTask).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Meeting", dueDate: "2028-02-29" }),
  );
  expect(executePlannerAgent(store, "create_note", { title: "Memo", text: "Some text" })).toEqual({
    status: "ok",
    data: { id: "note-id" },
  });
  expect(store.addNote).toHaveBeenCalledWith("Some text", "Memo");
  expect(
    executePlannerAgent(store, "create_task", { title: "Meeting", dueDate: "2026-02-29" }),
  ).toEqual({ status: "invalid" });
  expect(executePlannerAgent(store, "create_task", { title: "Meeting", id: "existing" })).toEqual({
    status: "invalid",
  });
  expect(executePlannerAgent(store, "create_note", { text: "x".repeat(8001) })).toEqual({
    status: "invalid",
  });
  expect(executePlannerAgent(store, "delete_task", { id: "existing" })).toEqual({
    status: "invalid",
  });
  expect(store.addTask).toHaveBeenCalledTimes(1);
  expect(store.addNote).toHaveBeenCalledTimes(1);
});

it("creates a new journal entry but never replaces an existing daily entry", () => {
  const store: PlannerAgentStore = fixture();
  const args = { title: "Today", content: "A thought", date: "2026-11-12", isDaily: true };
  expect(executePlannerAgent(store, "create_journal", args)).toMatchObject({ status: "ok" });
  const journal = vi.mocked(store.addJournal).mock.calls[0][0];
  expect(journal).toMatchObject({ ...args, linkKey: args.date });
  store.journal.push(journal);
  expect(executePlannerAgent(store, "create_journal", { ...args, content: "overwrite" })).toEqual({
    status: "conflict",
  });
  expect(store.addJournal).toHaveBeenCalledTimes(1);
});

it("paginates reads and excludes attachments and legacy Agent metadata", () => {
  const store: PlannerAgentStore = fixture();
  store.tasks = [
    { id: "task-a", title: "find task", category: "urgent-important", pipelineTaskId: "internal" },
  ];
  store.completed = [
    { id: "task-b", title: "find completed", category: "urgent-important", completedAt: 7 },
  ];
  store.notes = [{ id: "note", text: "find note", color: "tea", rotate: 1 }];
  store.journal = [
    {
      id: "journal",
      title: "find entry",
      content: "a".repeat(5000),
      date: "2026-11-12",
      linkKey: "find entry",
      isDaily: false,
      createdAt: 1,
      updatedAt: 1,
      attachments: [
        {
          id: "att",
          name: "private",
          type: "image",
          path: "file:///private",
          size: 10,
          createdAt: "2026-11-12",
        },
      ],
    },
  ];
  expect(executePlannerAgent(store, "list_tasks", { query: "FIND", limit: 1 })).toMatchObject({
    status: "ok",
    data: { items: [{ id: "task-a" }], nextOffset: 1 },
  });
  expect(executePlannerAgent(store, "list_tasks", { offset: 1 })).toMatchObject({
    status: "ok",
    data: { items: [{ id: "task-b", completedAt: 7 }], nextOffset: null },
  });
  expect(executePlannerAgent(store, "list_notes", { query: "find" })).toMatchObject({
    status: "ok",
    data: { items: [{ id: "note" }] },
  });
  const result = executePlannerAgent(store, "list_journal", { query: "find" });
  expect(result).toMatchObject({
    status: "ok",
    data: { items: [{ id: "journal", content: "a".repeat(4000) }] },
  });
  expect(JSON.stringify(result)).not.toContain("file://");
  expect(JSON.stringify(executePlannerAgent(store, "list_tasks", {}))).not.toContain(
    "pipelineTaskId",
  );
});

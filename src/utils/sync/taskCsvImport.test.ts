import { expect, it } from "vitest";
import { previewTaskCsv } from "./taskCsvImport";

it("reads Todoist task rows and preserves quotes and newlines; repeated import has the same IDs", async () => {
  const input =
    '\uFEFFTYPE,CONTENT,DESCRIPTION,DATE\r\nsection,Home,,\r\ntask,"Plan, then write","a ""quote""\nb",2026-11-12 09:30';
  const a = await previewTaskCsv(input);
  expect(a.skipped).toBe(1);
  expect(a.items[0]).toMatchObject({
    title: "Plan, then write",
    description: 'a "quote"\nb',
    dueDate: "2026-11-12",
    dueTime: "09:30",
  });
  expect((await previewTaskCsv(input)).items[0].id).toBe(a.items[0].id);
});

it("accepts TickTick preamble and keeps lists, tags, and completion", async () => {
  const result = await previewTaskCsv(
    'Version: 7.0\nTitle,List Name,Tags,Status,Due Date\nRead,Home,"a,b",2,2026-02-30',
  );
  expect(result.items[0]).toMatchObject({
    project: "Home",
    tags: ["a", "b"],
    completedAt: expect.any(Number),
    dueDate: undefined,
  });
});

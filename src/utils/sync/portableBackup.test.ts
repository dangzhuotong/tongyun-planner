import { afterEach, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  flush: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.read }));
vi.mock("../storage", () => ({ storageManager: { downloadFile: vi.fn(), local: {} } }));
vi.mock("../unifiedStorage", () => ({ storage: { flushNow: mocks.flush } }));
vi.mock("../journalAttachmentStorage", () => ({
  saveJournalAttachment: vi.fn(async () => "/new/attachment.png"),
  deleteJournalAttachment: vi.fn(async () => {}),
}));
import {
  exportPortableBackup,
  previewPortableBackup,
  restorePortableBackup,
} from "./portableBackup";

afterEach(() => vi.unstubAllGlobals());
it("round-trips journal attachment bytes without retaining the old file path or replacing an existing task", async () => {
  const entries = new Map<string, string>();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
  const task = { id: "t", title: "Backed up", category: "important-not-urgent" };
  localStorage.setItem("aero_todos", JSON.stringify([task]));
  localStorage.setItem(
    "tongyun_journal",
    JSON.stringify([
      {
        id: "j",
        title: "Journal",
        content: "text",
        isDaily: true,
        date: "2026-11-12",
        attachments: [{ id: "a", name: "image.png", type: "image/png", path: "/old/private.png" }],
      },
    ]),
  );
  localStorage.setItem(
    "aero_customization_config",
    JSON.stringify({ aiApiKey: "private", cardBackground: "grid" }),
  );
  mocks.read.mockResolvedValue("AQID");
  const preview = previewPortableBackup(await exportPortableBackup());
  expect(preview.count).toBe(1);
  expect(preview.files["media/1"]).toEqual(new Uint8Array([1, 2, 3]));
  expect(JSON.stringify(preview.backup)).not.toContain("/old/private.png");
  expect(JSON.stringify(preview.backup)).not.toContain('"aiApiKey"');
  localStorage.setItem("tongyun_journal", "[]");
  localStorage.setItem("aero_todos", JSON.stringify([{ ...task, title: "Edited after backup" }]));
  await restorePortableBackup(preview);
  expect(JSON.parse(localStorage.getItem("aero_todos")!)[0].title).toBe("Edited after backup");
  expect(JSON.parse(localStorage.getItem("tongyun_journal")!)[0].attachments[0].path).toBe(
    "/new/attachment.png",
  );
});

it("rejects an invalid archive before restoring anything", () => {
  expect(() =>
    previewPortableBackup(zipSync({ "planner.json": strToU8('{"format":"unknown"}') })),
  ).toThrow("备份格式无效");
});

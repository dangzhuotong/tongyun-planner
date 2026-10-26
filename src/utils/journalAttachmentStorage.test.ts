import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  deleteJournalAttachment,
  journalAttachmentSrc,
  migrateLegacyJournalAttachments,
} from "./journalAttachmentStorage";
import type { JournalEntry } from "../types";

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "entry-1",
    linkKey: "2026-01-01",
    title: "今日",
    content: "正文",
    date: "2026-01-01",
    isDaily: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("journalAttachmentStorage outside Tauri", () => {
  it("returns empty and browser-safe paths unchanged", () => {
    expect(journalAttachmentSrc("")).toBe("");
    expect(journalAttachmentSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(journalAttachmentSrc("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
    expect(journalAttachmentSrc("https://cdn.example/photo.png")).toBe(
      "https://cdn.example/photo.png",
    );
    expect(journalAttachmentSrc("http://cdn.example/photo.png")).toBe(
      "http://cdn.example/photo.png",
    );
  });

  it("returns a local file path unchanged without the desktop runtime", () => {
    expect(journalAttachmentSrc("attachments/e/a/photo.png")).toBe("attachments/e/a/photo.png");
  });

  it("does not invoke deletion outside Tauri", async () => {
    vi.mocked(invoke).mockReset();
    await expect(deleteJournalAttachment("attachments/e/a/photo.png")).resolves.toBeUndefined();
    await expect(deleteJournalAttachment("data:image/png;base64,AAAA")).resolves.toBeUndefined();
    await expect(deleteJournalAttachment("")).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("leaves legacy entries untouched outside Tauri, including data URLs", async () => {
    const entries = [
      makeEntry({
        attachments: [
          {
            id: "a1",
            name: "photo.png",
            path: "data:image/png;base64,AAAA",
            type: "image/png",
            size: 3,
            createdAt: "2026-01-01",
          },
        ],
      }),
      makeEntry({ id: "entry-2" }),
    ];

    const result = await migrateLegacyJournalAttachments(entries);
    expect(result).toBe(entries);
    expect(result[0].attachments?.[0].path).toBe("data:image/png;base64,AAAA");
  });
});

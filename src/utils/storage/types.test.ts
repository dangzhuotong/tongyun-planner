import { describe, it, expect } from "vitest";
import {
  ATTACHMENTS_PREFIX,
  DATA_PREFIX,
  getAttachmentPath,
  getDataPath,
  parseAttachmentPath,
} from "./types";

describe("storage path helpers", () => {
  it("should generate correct attachment path", () => {
    const path = getAttachmentPath("task123", "att456", "photo.png");
    expect(path).toBe("attachments/task123/att456/photo.png");
    expect(ATTACHMENTS_PREFIX).toBe("attachments");
  });

  it("should generate correct data path", () => {
    const path = getDataPath("tasks.json");
    expect(path).toBe("data/tasks.json");
    expect(DATA_PREFIX).toBe("data");
  });

  describe("parseAttachmentPath", () => {
    it("should correctly parse valid attachment path", () => {
      const parsed = parseAttachmentPath("attachments/t1/a2/image.jpg");
      expect(parsed).toEqual({
        taskId: "t1",
        attachmentId: "a2",
        filename: "image.jpg",
      });
    });

    it("should handle nested file names in attachment path", () => {
      const parsed = parseAttachmentPath("attachments/t1/a2/sub/folder/doc.pdf");
      expect(parsed).toEqual({
        taskId: "t1",
        attachmentId: "a2",
        filename: "sub/folder/doc.pdf",
      });
    });

    it("should return null for invalid attachment path", () => {
      expect(parseAttachmentPath("data/tasks.json")).toBeNull();
      expect(parseAttachmentPath("attachments/t1/a2")).toBeNull();
      expect(parseAttachmentPath("other/t1/a2/file.png")).toBeNull();
      expect(parseAttachmentPath("")).toBeNull();
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  JIANGUOYUN_WEBDAV_URL,
  commitWebDavDraft,
  commitWebDavDraftAt,
  isAllowedWebDavUrl,
  isWebDavUrlLocked,
  shouldCommitWebDavDraft,
  urlForPreset,
} from "./webdavForm";

describe("webdavForm", () => {
  describe("urlForPreset", () => {
    it("pre-fills the Jianguoyun URL", () => {
      expect(JIANGUOYUN_WEBDAV_URL).toBe("https://dav.jianguoyun.com/dav/");
      expect(urlForPreset("jianguoyun", "https://mirror.example/dav/")).toBe(
        JIANGUOYUN_WEBDAV_URL,
      );
    });

    it("keeps the current URL for a custom preset", () => {
      expect(urlForPreset("custom", "https://mirror.example/dav/")).toBe(
        "https://mirror.example/dav/",
      );
    });

    it("never locks the URL field", () => {
      expect(isWebDavUrlLocked("jianguoyun")).toBe(false);
      expect(isWebDavUrlLocked("custom")).toBe(false);
    });
  });

  describe("isAllowedWebDavUrl", () => {
    it("accepts https anywhere", () => {
      expect(isAllowedWebDavUrl("https://dav.example.com/dav/")).toBe(true);
      expect(isAllowedWebDavUrl("  https://dav.example.com/dav/  ")).toBe(true);
    });

    it("accepts http only for loopback hosts", () => {
      expect(isAllowedWebDavUrl("http://localhost:8080/dav/")).toBe(true);
      expect(isAllowedWebDavUrl("http://127.0.0.1/dav/")).toBe(true);
      expect(isAllowedWebDavUrl("http://[::1]:8080/dav/")).toBe(true);
      expect(isAllowedWebDavUrl("http://evil.example/dav/")).toBe(false);
      expect(isAllowedWebDavUrl("http://localhost.evil.example/dav/")).toBe(false);
    });

    it("rejects empty, malformed, and non-http(s) URLs", () => {
      expect(isAllowedWebDavUrl("")).toBe(false);
      expect(isAllowedWebDavUrl("   ")).toBe(false);
      expect(isAllowedWebDavUrl("not a url")).toBe(false);
      expect(isAllowedWebDavUrl("ftp://files.example/dav/")).toBe(false);
      expect(isAllowedWebDavUrl("https://")).toBe(false);
    });
  });

  describe("commitWebDavDraft", () => {
    it("trims url and username, and drops an empty password", () => {
      const applied: unknown[] = [];
      const result = commitWebDavDraft(
        { url: "  https://dav.example.com/dav/  ", username: "  me@example.com  ", password: "" },
        (config) => applied.push(config),
      );
      expect(result).toEqual({
        url: "https://dav.example.com/dav/",
        username: "me@example.com",
        password: undefined,
      });
      expect(applied).toHaveLength(1);
      expect(applied[0]).toBe(result);
    });

    it("keeps a non-empty password", () => {
      const result = commitWebDavDraft(
        { url: "https://dav.example.com/dav/", username: "me", password: "secret" },
        () => undefined,
      );
      expect(result?.password).toBe("secret");
    });

    it("returns null and does not apply when the URL is disallowed", () => {
      const apply = vi.fn();
      const result = commitWebDavDraft(
        { url: "http://evil.example/dav/", username: "me", password: "secret" },
        apply,
      );
      expect(result).toBeNull();
      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe("commitWebDavDraftAt", () => {
    const draft = {
      url: "https://dav.example.com/dav/",
      username: "me@example.com",
      password: "secret",
    };

    it("does not persist keystrokes", () => {
      const apply = vi.fn();
      expect(shouldCommitWebDavDraft("change")).toBe(false);
      expect(commitWebDavDraftAt("change", draft, apply)).toBeNull();
      expect(apply).not.toHaveBeenCalled();
    });

    it("persists on blur and on an explicit save", () => {
      expect(shouldCommitWebDavDraft("blur")).toBe(true);
      expect(shouldCommitWebDavDraft("save")).toBe(true);

      const blurApply = vi.fn();
      expect(commitWebDavDraftAt("blur", draft, blurApply)?.url).toBe(
        "https://dav.example.com/dav/",
      );
      expect(blurApply).toHaveBeenCalledTimes(1);

      const saveApply = vi.fn();
      expect(commitWebDavDraftAt("save", draft, saveApply)?.username).toBe("me@example.com");
      expect(saveApply).toHaveBeenCalledTimes(1);
    });
  });
});

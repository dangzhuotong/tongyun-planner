import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { WebDAVProvider, downloadWithMeta, statFile, uploadWithMeta } from "../webdavProvider";
import { commitWebDavDraft, isWebDavUrlLocked, urlForPreset } from "../webdavForm";
import { categoryVersionAfterPull, shouldPullCategory } from "../pullDecision";

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

const config = {
  url: "https://dav.jianguoyun.com/dav/",
  username: "user@example.com",
  password: "app-password",
};

describe("WebDAV desktop transport", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      new LocalStorageMock() as unknown as Storage;
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("window", {});
    vi.stubGlobal("isTauri", undefined);
  });

  it("does not use webview fetch outside the desktop app", async () => {
    await expect(statFile(config, "TongYunPlanner/tasks.json")).rejects.toThrow(/CORS|desktop/);
    await expect(downloadWithMeta(config, "TongYunPlanner/tasks.json")).rejects.toThrow(
      /CORS|desktop/,
    );
    await expect(uploadWithMeta(config, "TongYunPlanner/tasks.json", "{}")).rejects.toThrow(
      /CORS|desktop/,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("routes stat, download, upload, and mkdir through Rust commands", async () => {
    vi.stubGlobal("window", { isTauri: true, __TAURI_INTERNALS__: {} });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "webdav_stat" || cmd === "webdav_upload_meta") {
        return { exists: true, etag: "etag-1", lastModified: "Mon, 01 Jan 2026 00:00:00 GMT" };
      }
      if (cmd === "webdav_download_meta") {
        return { content: "{}", etag: "etag-1", lastModified: null };
      }
      return null;
    });

    await statFile(config, "TongYunPlanner/tasks.json");
    await downloadWithMeta(config, "TongYunPlanner/tasks.json");
    await uploadWithMeta(config, "TongYunPlanner/config.json", "{}");
    const provider = new WebDAVProvider(config);
    await expect(provider.test()).resolves.toBe(true);

    const commands = vi.mocked(invoke).mock.calls.map((call) => call[0]);
    expect(commands).toContain("webdav_stat");
    expect(commands).toContain("webdav_download_meta");
    expect(commands).toContain("webdav_upload_meta");
    expect(commands).toContain("webdav_mkcol");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists WebDAV settings on edit, including a cleared password", () => {
    const provider = new WebDAVProvider();
    const applied: unknown[] = [];
    commitWebDavDraft(
      { url: " https://dav.example.com/dav/ ", username: " me@example.com ", password: "secret" },
      (next) => {
        applied.push(next);
        provider.setConfig(next);
      },
    );
    expect(provider.isConfigured()).toBe(true);
    expect(localStorage.getItem("tongyun_webdav_url")).toBe("https://dav.example.com/dav/");
    expect(localStorage.getItem("tongyun_webdav_user")).toBe("me@example.com");
    expect(localStorage.getItem("tongyun_webdav_pass")).toBe("secret");

    provider.setConfig({ url: "https://dav.example.com/dav/", username: "me@example.com" });
    expect(localStorage.getItem("tongyun_webdav_pass")).toBeNull();
    expect(applied[0]).toMatchObject({ password: "secret" });
  });

  it("lets the Jianguoyun preset pre-fill the URL without locking the field", () => {
    expect(isWebDavUrlLocked("jianguoyun")).toBe(false);
    expect(isWebDavUrlLocked("custom")).toBe(false);
    expect(urlForPreset("jianguoyun", "https://old.example/dav/")).toBe(
      "https://dav.jianguoyun.com/dav/",
    );
    expect(urlForPreset("custom", "https://old.example/dav/")).toBe("https://old.example/dav/");
  });

  it("still pulls config when a secret import is forced, without rolling a newer local version backward", () => {
    expect(shouldPullCategory(20, 10, false)).toBe(false);
    expect(shouldPullCategory(20, 10, true)).toBe(true);
    expect(shouldPullCategory(5, 0, true)).toBe(false);
    expect(categoryVersionAfterPull(20, 10, true)).toBe(20);
    expect(categoryVersionAfterPull(5, 10, false)).toBe(10);
  });
});

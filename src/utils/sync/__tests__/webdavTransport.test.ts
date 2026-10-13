import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { WebDAVProvider, downloadWithMeta, statFile, uploadWithMeta } from "../webdavProvider";
import {
  commitWebDavDraft,
  commitWebDavDraftAt,
  isAllowedWebDavUrl,
  isWebDavUrlLocked,
  shouldCommitWebDavDraft,
  urlForPreset,
} from "../webdavForm";
import { categoryVersionAfterPull, shouldPullCategory } from "../pullDecision";
import { encryptSecretFields } from "../secretSync";
import { secretSyncDecryptWarning, setSyncSecretsOptIn } from "../syncSecretsPref";

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

  it("rejects cleartext WebDAV URLs and does not persist them", () => {
    expect(isAllowedWebDavUrl("https://dav.jianguoyun.com/dav/")).toBe(true);
    expect(isAllowedWebDavUrl("http://localhost:8080/dav/")).toBe(true);
    expect(isAllowedWebDavUrl("http://127.0.0.1/dav/")).toBe(true);
    expect(isAllowedWebDavUrl("http://[::1]/dav/")).toBe(true);
    expect(isAllowedWebDavUrl("http://evil.example/dav/")).toBe(false);
    expect(isAllowedWebDavUrl("http://ex")).toBe(false);

    const applied: unknown[] = [];
    expect(
      commitWebDavDraft(
        { url: "http://evil.example/dav/", username: "me@example.com", password: "secret" },
        (next) => applied.push(next),
      ),
    ).toBeNull();
    expect(applied).toEqual([]);
    expect(localStorage.getItem("tongyun_webdav_url")).toBeNull();
  });

  it("commits the URL on blur or save, not on each keystroke", () => {
    expect(shouldCommitWebDavDraft("change")).toBe(false);
    expect(shouldCommitWebDavDraft("blur")).toBe(true);
    expect(shouldCommitWebDavDraft("save")).toBe(true);

    const provider = new WebDAVProvider();
    const draft = {
      url: "https://dav.example.com/dav/",
      username: "me@example.com",
      password: "secret",
    };
    expect(commitWebDavDraftAt("change", draft, (next) => provider.setConfig(next))).toBeNull();
    expect(localStorage.getItem("tongyun_webdav_url")).toBeNull();

    expect(commitWebDavDraftAt("blur", draft, (next) => provider.setConfig(next))?.url).toBe(
      "https://dav.example.com/dav/",
    );
    expect(localStorage.getItem("tongyun_webdav_url")).toBe("https://dav.example.com/dav/");
    expect(secretSyncDecryptWarning("口令与云端不一致")).toBeNull();
  });

  it("keeps the cloud secret envelope when keep-local uploads config without a passphrase", async () => {
    vi.stubGlobal("window", { isTauri: true, __TAURI_INTERNALS__: {} });
    setSyncSecretsOptIn(true);
    const envelope = await encryptSecretFields(
      { aiApiKey: "sk-cloud-only", providerApiKeys: { x: "X" } },
      "right-pass",
      1_000,
    );
    const uploads: { filename: string; content: string }[] = [];
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
      const payload = (args ?? {}) as { filename?: string; content?: string };
      const filename = String(payload.filename ?? "");
      if (cmd === "webdav_mkcol") return null;
      if (cmd === "webdav_download_meta") {
        if (filename.endsWith("config.json")) {
          return {
            content: JSON.stringify({ darkMode: "dark", encryptedSecrets: envelope }),
            etag: "etag-config",
            lastModified: null,
          };
        }
        if (filename.endsWith("manifest.json")) {
          return {
            content: JSON.stringify({ config: { version: 1 } }),
            etag: "etag-manifest",
            lastModified: null,
          };
        }
        throw "E_NOT_FOUND";
      }
      if (cmd === "webdav_upload_meta") {
        uploads.push({ filename, content: String(payload.content ?? "") });
        return { exists: true, etag: "etag-new", lastModified: "Mon, 01 Jan 2026 00:00:00 GMT" };
      }
      if (cmd === "webdav_stat") {
        return { exists: true, etag: "etag-new", lastModified: "Mon, 01 Jan 2026 00:00:00 GMT" };
      }
      return null;
    });

    const provider = new WebDAVProvider(config);
    localStorage.setItem("tongyun_cat_ver_config", "10");
    await provider.uploadCategory("config", {
      darkMode: "light",
      syncSecrets: true,
      aiApiKey: "",
    });

    const configUpload = uploads.find((item) => item.filename.endsWith("config.json"));
    expect(configUpload).toBeTruthy();
    const uploaded = JSON.parse(configUpload?.content || "{}");
    expect(uploaded.encryptedSecrets).toEqual(envelope);
    expect(configUpload?.content).not.toContain("sk-cloud-only");
  });

  it("still pulls config when a secret import is forced, without rolling a newer local version backward", () => {
    expect(shouldPullCategory(20, 10, false)).toBe(false);
    expect(shouldPullCategory(20, 10, true)).toBe(true);
    expect(shouldPullCategory(5, 0, true)).toBe(false);
    expect(categoryVersionAfterPull(20, 10, true)).toBe(20);
    expect(categoryVersionAfterPull(5, 10, false)).toBe(10);
  });
});

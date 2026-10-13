import type { StorageProvider, StorageBackendType } from "./types";
import type { WebDavConfig } from "../../types";
import { invoke } from "@tauri-apps/api/core";
import { isDesktopRuntime, WEBDAV_REQUIRES_DESKTOP } from "../tauriRuntime";

const REMOTE_DIR = "TongYunPlanner/";
const isTauri = () => isDesktopRuntime();

function base64Encode(data: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < data.length; i++) {
    chars.push(String.fromCharCode(data[i]));
  }
  return btoa(chars.join(""));
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class WebDAVStorageProvider implements StorageProvider {
  readonly type: StorageBackendType = "webdav";
  readonly displayName = "坚果云 WebDAV";
  readonly supportsPublicUrl = false;
  private config: WebDavConfig | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    const url = localStorage.getItem("tongyun_webdav_url");
    const username = localStorage.getItem("tongyun_webdav_user");
    const password = localStorage.getItem("tongyun_webdav_pass");
    if (url && username) {
      this.config = { url, username, password: password || undefined };
    }
  }

  private getConfig(): WebDavConfig {
    if (this.config) return this.config;
    this.loadFromStorage();
    if (!this.config) throw new Error("WebDAV not configured");
    return this.config;
  }

  isConfigured(): boolean {
    if (!this.config) this.loadFromStorage();
    return !!(this.config?.url && this.config?.username);
  }

  /** Keep the in-memory account aligned when settings are edited, not only after a restart. */
  setConfig(config: WebDavConfig): void {
    this.config = {
      url: config.url,
      username: config.username,
      password: config.password,
    };
  }

  async test(): Promise<boolean> {
    try {
      await this.ensureDir("");
      await this.writeText("__test__.txt", "ok");
      await this.deleteFile("__test__.txt");
      return true;
    } catch {
      return false;
    }
  }

  /** Ensure a directory exists, creating intermediate dirs recursively */
  private async ensureDir(dirname: string): Promise<void> {
    const c = this.getConfig();
    // Ensure the base REMOTE_DIR first
    if (isTauri()) {
      try {
        await invoke("webdav_mkcol", {
          url: c.url,
          username: c.username,
          password: c.password || null,
          dirname: REMOTE_DIR.replace(/\/$/, ""),
        });
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message || "";
        if (!msg.includes("E_HTTP_405") && !msg.includes("E_HTTP_409")) throw e;
      }
    } else {
      throw new Error(WEBDAV_REQUIRES_DESKTOP);
    }
    if (!dirname) return;

    // Create each subdirectory level
    const segments = dirname.split("/").filter(Boolean);
    let acc = REMOTE_DIR;
    for (const seg of segments) {
      acc += seg + "/";
      const c = this.getConfig();
      if (isTauri()) {
        try {
          await invoke("webdav_mkcol", {
            url: c.url,
            username: c.username,
            password: c.password || null,
            dirname: acc,
          });
        } catch (e: any) {
          const msg = typeof e === "string" ? e : e?.message || "";
          if (!msg.includes("E_HTTP_405") && !msg.includes("E_HTTP_409")) throw e;
        }
        continue;
      }
      throw new Error(WEBDAV_REQUIRES_DESKTOP);
    }
  }

  /** Ensure the base REMOTE_DIR and the parent of a file path exist */
  private async ensureParent(path: string): Promise<void> {
    // Ensure the base directory exists first
    await this.ensureDir("");
    // Then ensure the file's parent directory
    const parent = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "";
    if (parent) await this.ensureDir(parent);
  }

  async uploadFile(path: string, data: Uint8Array, mime: string): Promise<string> {
    const c = this.getConfig();
    const fullPath = REMOTE_DIR + path;

    await this.ensureParent(path);

    const b64 = base64Encode(data);
    if (isTauri()) {
      await invoke("webdav_upload_binary", {
        url: c.url,
        username: c.username,
        password: c.password || null,
        filename: fullPath,
        contentBase64: b64,
        contentType: mime,
      });
      return fullPath;
    }

    throw new Error(WEBDAV_REQUIRES_DESKTOP);
  }

  async downloadFile(path: string): Promise<Uint8Array | null> {
    const c = this.getConfig();
    const fullPath = REMOTE_DIR + path;

    if (isTauri()) {
      try {
        const b64: string = await invoke("webdav_download_binary", {
          url: c.url,
          username: c.username,
          password: c.password || null,
          filename: fullPath,
        });
        return base64Decode(b64);
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message || "";
        if (msg.startsWith("E_NOT_FOUND")) return null;
        throw e;
      }
    }

    throw new Error(WEBDAV_REQUIRES_DESKTOP);
  }

  async deleteFile(path: string): Promise<void> {
    const c = this.getConfig();
    const fullPath = REMOTE_DIR + path;

    if (isTauri()) {
      try {
        await invoke("webdav_delete", {
          url: c.url,
          username: c.username,
          password: c.password || null,
          filename: fullPath,
        });
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message || "";
        if (!msg.startsWith("E_NOT_FOUND")) throw e;
      }
      return;
    }

    throw new Error(WEBDAV_REQUIRES_DESKTOP);
  }

  async listFiles(_prefix: string): Promise<string[]> {
    throw new Error("WebDAV PROPFIND not yet implemented");
  }

  getPublicUrl(_path: string): string | null {
    return null;
  }

  async getFileUrl(path: string, mime: string): Promise<string> {
    const data = await this.downloadFile(path);
    if (!data) throw new Error("File not found: " + path);
    return URL.createObjectURL(new Blob([data], { type: mime }));
  }

  async writeText(path: string, content: string): Promise<void> {
    const c = this.getConfig();
    const fullPath = REMOTE_DIR + path;
    await this.ensureParent(path);

    if (isTauri()) {
      await invoke("webdav_upload", {
        url: c.url,
        username: c.username,
        password: c.password || null,
        filename: fullPath,
        content,
      });
      return;
    }

    throw new Error(WEBDAV_REQUIRES_DESKTOP);
  }

  async readText(path: string): Promise<string | null> {
    const c = this.getConfig();
    const fullPath = REMOTE_DIR + path;

    if (isTauri()) {
      try {
        return await invoke("webdav_download", {
          url: c.url,
          username: c.username,
          password: c.password || null,
          filename: fullPath,
        });
      } catch (e: any) {
        const msg = typeof e === "string" ? e : e?.message || "";
        if (msg.startsWith("E_NOT_FOUND")) return null;
        throw e;
      }
    }

    throw new Error(WEBDAV_REQUIRES_DESKTOP);
  }
}

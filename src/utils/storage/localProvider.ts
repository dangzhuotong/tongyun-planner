import type { StorageProvider, StorageBackendType } from "./types";
import { invoke } from "@tauri-apps/api/core";

const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

/** Convert Uint8Array → base64 string (chunked to avoid call stack overflow on large arrays) */
function uint8ToBase64(data: Uint8Array): string {
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Convert base64 string → Uint8Array */
function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class LocalStorageProvider implements StorageProvider {
  readonly type: StorageBackendType = "local";
  readonly displayName = "本地存储";
  readonly supportsPublicUrl = false;

  isConfigured(): boolean {
    return isTauri();
  }

  async test(): Promise<boolean> {
    if (!isTauri()) return false;
    try {
      await invoke("file_save_b64", { path: "__test__.tmp", dataB64: btoa("ok") });
      await invoke("file_delete", { path: "__test__.tmp" });
      return true;
    } catch { return false; }
  }

  async uploadFile(path: string, data: Uint8Array, _mime: string): Promise<string> {
    if (!isTauri()) throw new Error("Local storage requires Tauri desktop runtime");
    const dataB64 = uint8ToBase64(data);
    await invoke("file_save_b64", { path, dataB64 });
    return path;
  }

  async downloadFile(path: string): Promise<Uint8Array | null> {
    if (!isTauri()) throw new Error("Local storage requires Tauri desktop runtime");
    try {
      const b64: string = await invoke("file_read_b64", { path });
      return base64ToUint8(b64);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "";
      if (msg.includes("NOT_FOUND")) return null;
      throw e;
    }
  }

  async deleteFile(path: string): Promise<void> {
    if (!isTauri()) throw new Error("Local storage requires Tauri desktop runtime");
    try {
      await invoke("file_delete", { path });
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "";
      if (!msg.includes("NOT_FOUND")) throw e;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    if (!isTauri()) throw new Error("Local storage requires Tauri desktop runtime");
    return await invoke("file_list", { prefix });
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
    await this.uploadFile(path, new TextEncoder().encode(content), "text/plain");
  }

  async readText(path: string): Promise<string | null> {
    const bytes = await this.downloadFile(path);
    if (!bytes) return null;
    return new TextDecoder().decode(bytes);
  }
}

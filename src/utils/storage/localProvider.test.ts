import { describe, it, expect } from "vitest";
import { LocalStorageProvider } from "./localProvider";

const TAURI_ERROR = "Local storage requires Tauri desktop runtime";

describe("LocalStorageProvider outside Tauri", () => {
  const provider = new LocalStorageProvider();

  it("exposes static provider metadata", () => {
    expect(provider.type).toBe("local");
    expect(provider.displayName).toBe("本地存储");
    expect(provider.supportsPublicUrl).toBe(false);
  });

  it("reports not configured without the Tauri runtime", () => {
    expect(provider.isConfigured()).toBe(false);
  });

  it("resolves test() to false instead of throwing", async () => {
    await expect(provider.test()).resolves.toBe(false);
  });

  it("returns null from getPublicUrl", () => {
    expect(provider.getPublicUrl("attachments/a/b/c.png")).toBeNull();
  });

  it("rejects binary operations with the desktop-only error", async () => {
    await expect(provider.uploadFile("p", new Uint8Array([1]), "image/png")).rejects.toThrow(
      TAURI_ERROR,
    );
    await expect(provider.downloadFile("p")).rejects.toThrow(TAURI_ERROR);
    await expect(provider.deleteFile("p")).rejects.toThrow(TAURI_ERROR);
    await expect(provider.listFiles("attachments")).rejects.toThrow(TAURI_ERROR);
    await expect(provider.getFileUrl("p", "image/png")).rejects.toThrow(TAURI_ERROR);
  });

  it("rejects text operations with the desktop-only error", async () => {
    await expect(provider.writeText("p", "hello")).rejects.toThrow(TAURI_ERROR);
    await expect(provider.readText("p")).rejects.toThrow(TAURI_ERROR);
  });
});

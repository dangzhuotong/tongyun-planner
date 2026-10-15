import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isDesktopRuntime, WEBDAV_REQUIRES_DESKTOP } from "./tauriRuntime";

describe("tauriRuntime utils", () => {
  beforeEach(() => {
    delete (globalThis as any).isTauri;
    delete (globalThis as any).__TAURI_INTERNALS__;
    delete (globalThis as any).__TAURI__;
    if (typeof window !== "undefined") {
      delete (window as any).isTauri;
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;
    }
  });

  afterEach(() => {
    delete (globalThis as any).isTauri;
    delete (globalThis as any).__TAURI_INTERNALS__;
    delete (globalThis as any).__TAURI__;
    if (typeof window !== "undefined") {
      delete (window as any).isTauri;
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;
    }
  });

  it("should export WEBDAV_REQUIRES_DESKTOP error message constant", () => {
    expect(WEBDAV_REQUIRES_DESKTOP).toContain("WebDAV requests must run in the desktop app");
  });

  it("should return false when no Tauri runtime flags are present", () => {
    expect(isDesktopRuntime()).toBe(false);
  });

  it("should return true when globalThis.isTauri is true", () => {
    (globalThis as any).isTauri = true;
    expect(isDesktopRuntime()).toBe(true);
  });

  it("should return true when globalThis.__TAURI_INTERNALS__ is set", () => {
    (globalThis as any).__TAURI_INTERNALS__ = {};
    expect(isDesktopRuntime()).toBe(true);
  });

  it("should return true when globalThis.__TAURI__ is set", () => {
    (globalThis as any).__TAURI__ = {};
    expect(isDesktopRuntime()).toBe(true);
  });

  it("should return true when window.isTauri is true", () => {
    vi.stubGlobal("window", { isTauri: true });
    expect(isDesktopRuntime()).toBe(true);
  });

  it("should return true when window.__TAURI_INTERNALS__ is set", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(isDesktopRuntime()).toBe(true);
  });

  it("should return true when window.__TAURI__ is set", () => {
    vi.stubGlobal("window", { __TAURI__: {} });
    expect(isDesktopRuntime()).toBe(true);
  });

  it("should return false when isTauri is explicitly false and internals are undefined or null", () => {
    (globalThis as any).isTauri = false;
    (globalThis as any).__TAURI_INTERNALS__ = null;
    (globalThis as any).__TAURI__ = undefined;
    expect(isDesktopRuntime()).toBe(false);
  });
});

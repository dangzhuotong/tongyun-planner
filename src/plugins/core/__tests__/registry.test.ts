import { describe, it, expect, beforeEach, vi } from "vitest";
import { pluginRegistry } from "../registry";
import type { TongyunPlugin } from "../types";

class LocalStorageMock {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null;
  }
}

(globalThis as any).localStorage = new LocalStorageMock();

describe("PluginRegistry", () => {
  const dummyPlugin: TongyunPlugin = {
    manifest: {
      id: "test-plugin",
      name: "测试插件",
      description: "用于单元测试的虚拟插件",
      version: "1.0.0",
      category: "tool",
      defaultEnabled: true,
    },
    activate: vi.fn(),
    deactivate: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("registers a plugin and activates it if defaultEnabled", () => {
    pluginRegistry.register(dummyPlugin);
    expect(pluginRegistry.getPlugin("test-plugin")).toBe(dummyPlugin);
    expect(pluginRegistry.isEnabled("test-plugin")).toBe(true);
    expect(dummyPlugin.activate).toHaveBeenCalled();
  });

  it("can disable and enable a plugin, triggering lifecycle hooks", () => {
    pluginRegistry.disable("test-plugin");
    expect(pluginRegistry.isEnabled("test-plugin")).toBe(false);
    expect(dummyPlugin.deactivate).toHaveBeenCalled();

    pluginRegistry.enable("test-plugin");
    expect(pluginRegistry.isEnabled("test-plugin")).toBe(true);
  });

  it("toggles enabled state properly", () => {
    expect(pluginRegistry.isEnabled("test-plugin")).toBe(true);
    pluginRegistry.toggle("test-plugin");
    expect(pluginRegistry.isEnabled("test-plugin")).toBe(false);
    pluginRegistry.toggle("test-plugin");
    expect(pluginRegistry.isEnabled("test-plugin")).toBe(true);
  });
});

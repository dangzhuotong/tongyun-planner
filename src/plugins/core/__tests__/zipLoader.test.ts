import { describe, it, expect, beforeEach } from "vitest";
import {
  generateQuickNotesSampleZip,
  parsePluginZip,
  installZipPlugin,
  getInstalledDynamicPackages,
  uninstallDynamicPlugin,
  exportPluginZip,
} from "../zipLoader";
import { pluginRegistry } from "../registry";

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

describe("Plugin Zip Loader & Dynamic Package Engine", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates a valid sample zip and parses manifest and readme", async () => {
    const zipBlob = await generateQuickNotesSampleZip();
    expect(zipBlob).toBeDefined();
    expect(zipBlob.size).toBeGreaterThan(0);

    const pkg = await parsePluginZip(zipBlob);
    expect(pkg.manifest.id).toBe("quick-notes");
    expect(pkg.manifest.name).toBe("便签灵感库");
    expect(pkg.manifest.database?.type).toBe("sqlite");
    expect(pkg.readme).toContain("便签灵感库插件");
  });

  it("installs a zip plugin, registers it, and persists dynamic package", async () => {
    const zipBlob = await generateQuickNotesSampleZip();
    const plugin = await installZipPlugin(zipBlob);

    expect(plugin.manifest.id).toBe("quick-notes");
    expect(pluginRegistry.getPlugin("quick-notes")).toBeDefined();
    expect(pluginRegistry.isEnabled("quick-notes")).toBe(true);

    const packages = getInstalledDynamicPackages();
    expect(packages.length).toBe(1);
    expect(packages[0].manifest.id).toBe("quick-notes");
  });

  it("exports an installed plugin back as a zip blob", async () => {
    const zipBlob = await generateQuickNotesSampleZip();
    await installZipPlugin(zipBlob);

    const exported = await exportPluginZip("quick-notes");
    expect(exported).toBeDefined();
    expect(exported!.size).toBeGreaterThan(0);
  });

  it("uninstalls a dynamic plugin cleanly from registry and storage", async () => {
    const zipBlob = await generateQuickNotesSampleZip();
    await installZipPlugin(zipBlob);

    expect(pluginRegistry.getPlugin("quick-notes")).toBeDefined();

    const ok = uninstallDynamicPlugin("quick-notes");
    expect(ok).toBe(true);

    expect(pluginRegistry.getPlugin("quick-notes")).toBeUndefined();
    expect(pluginRegistry.isEnabled("quick-notes")).toBe(false);
    expect(getInstalledDynamicPackages().length).toBe(0);
  });
});

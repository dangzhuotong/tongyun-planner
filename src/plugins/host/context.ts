import { hasPermission } from "./validate";
import type { KeyValueStore, PluginContext, PluginManifest, PluginRecord } from "./types";

export class PluginAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginAccessError";
  }
}

function assertUsable(record: PluginRecord): void {
  if (record.status !== "enabled") {
    throw new PluginAccessError(`插件 ${record.plugin.manifest.id} 未启用`);
  }
}

function assertKey(manifest: PluginManifest, key: string): void {
  if (!manifest.storageKeys.includes(key)) {
    throw new PluginAccessError(`插件 ${manifest.id} 不能访问键 ${key}`);
  }
}

export function createPluginContext(record: PluginRecord, store: KeyValueStore): PluginContext {
  const manifest = record.plugin.manifest;
  return {
    storage: {
      get(key: string) {
        assertUsable(record);
        if (!hasPermission(manifest, "storage:read")) {
          throw new PluginAccessError(`插件 ${manifest.id} 没有 storage:read`);
        }
        assertKey(manifest, key);
        return store.getItem(key);
      },
      set(key: string, value: string) {
        assertUsable(record);
        if (!hasPermission(manifest, "storage:write")) {
          throw new PluginAccessError(`插件 ${manifest.id} 没有 storage:write`);
        }
        assertKey(manifest, key);
        store.setItem(key, value);
      },
      remove(key: string) {
        assertUsable(record);
        if (!hasPermission(manifest, "storage:write")) {
          throw new PluginAccessError(`插件 ${manifest.id} 没有 storage:write`);
        }
        assertKey(manifest, key);
        store.removeItem(key);
      },
    },
  };
}

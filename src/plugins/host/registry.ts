import { createPluginContext } from "./context";
import { pluginIdFromSlot, pluginSlot, type MainSlot, type PluginSlot } from "./slots";
import {
  loadEnabledMap,
  serializeEnabledMap,
  writeEnabledMap,
  type PluginEnabledMap,
} from "./state";
import {
  PLUGIN_STATE_KEY,
  type KeyValueStore,
  type PluginBridges,
  type PluginCommand,
  type PluginContext,
  type PluginRecord,
  type PluginViewApi,
  type TongyunPlugin,
} from "./types";
import { hasPermission, validateManifest } from "./validate";

export interface SidebarItem {
  slot: PluginSlot;
  label: string;
  icon?: "newspaper" | "puzzle";
  pluginId: string;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "未知错误");
}

export class PluginHost {
  private records: PluginRecord[] = [];
  private byId = new Map<string, PluginRecord>();
  private enabledMap: PluginEnabledMap = {};
  private bridges: PluginBridges | null = null;

  constructor(private readonly store: KeyValueStore) {}

  load(plugins: TongyunPlugin[]): void {
    this.records = [];
    this.byId = new Map();
    this.enabledMap = loadEnabledMap(this.store);
    const seen = new Set<string>();
    for (const plugin of plugins) {
      const verdict = validateManifest(plugin.manifest, seen);
      const record: PluginRecord = {
        plugin,
        status: "disabled",
      };
      if (!verdict.ok) {
        record.status = verdict.status;
        record.reason = verdict.reason;
        this.records.push(record);
        if (plugin.manifest?.id && !this.byId.has(plugin.manifest.id)) {
          this.byId.set(plugin.manifest.id, record);
        }
        continue;
      }
      const enabled =
        this.enabledMap[plugin.manifest.id]?.enabled ?? plugin.manifest.defaultEnabled;
      this.records.push(record);
      this.byId.set(plugin.manifest.id, record);
      if (enabled) this.activate(record);
      else record.status = "disabled";
    }
  }

  setBridges(bridges: PluginBridges): void {
    this.bridges = bridges;
  }

  list(): PluginRecord[] {
    return this.records;
  }

  record(id: string): PluginRecord | undefined {
    return this.byId.get(id);
  }

  /** 已启用且未失败的侧栏贡献。顺序跟注册数组一致。 */
  sidebarItems(): SidebarItem[] {
    const items: SidebarItem[] = [];
    for (const record of this.records) {
      if (record.status !== "enabled" || !record.plugin.sidebar) continue;
      items.push({
        slot: pluginSlot(record.plugin.manifest.id),
        label: record.plugin.sidebar.label,
        icon: record.plugin.sidebar.icon,
        pluginId: record.plugin.manifest.id,
      });
    }
    return items;
  }

  /** 没有 commands:register 的命令不会进入面板。 */
  commands(): Array<PluginCommand & { pluginId: string; slot: PluginSlot }> {
    const items: Array<PluginCommand & { pluginId: string; slot: PluginSlot }> = [];
    for (const record of this.records) {
      if (record.status !== "enabled" || !record.plugin.commands?.length) continue;
      if (!hasPermission(record.plugin.manifest, "commands:register")) continue;
      for (const command of record.plugin.commands) {
        items.push({
          ...command,
          pluginId: record.plugin.manifest.id,
          slot: pluginSlot(record.plugin.manifest.id),
        });
      }
    }
    return items;
  }

  contextFor(id: string): PluginContext {
    const record = this.byId.get(id);
    if (!record) throw new Error(`未知插件 ${id}`);
    return createPluginContext(record, this.store);
  }

  viewApi(id: string, bridges: PluginBridges | null = this.bridges): PluginViewApi | null {
    const record = this.byId.get(id);
    if (!record || record.status !== "enabled" || !bridges) return null;
    const manifest = record.plugin.manifest;
    const api: PluginViewApi = { config: bridges.config };
    if (hasPermission(manifest, "tasks:write")) api.saveTask = bridges.saveTask;
    if (hasPermission(manifest, "journal:write")) api.saveJournal = bridges.saveJournal;
    return api;
  }

  setEnabled(id: string, enabled: boolean): void {
    const record = this.byId.get(id);
    if (!record || record.status === "invalid" || record.status === "incompatible") return;
    if (!enabled) {
      this.deactivate(record);
      record.status = "disabled";
    } else {
      this.activate(record);
    }
    this.enabledMap = writeEnabledMap(this.enabledMap, id, enabled);
    this.store.setItem(PLUGIN_STATE_KEY, serializeEnabledMap(this.enabledMap));
  }

  retry(id: string): void {
    const record = this.byId.get(id);
    if (!record || record.status !== "failed") return;
    this.activate(record);
  }

  markFailed(id: string, message: string): void {
    const record = this.byId.get(id);
    if (!record || record.status === "invalid" || record.status === "incompatible") return;
    record.status = "failed";
    record.reason = message;
  }

  /**
   * 把 "news" 或 plugin:id 收成当前可用槽位。
   * 插件停用、失败或不存在时回到主页。核心页原样返回。
   */
  normalizeSlot(slot: string): MainSlot {
    const id = this.idForLocation(slot);
    if (!id) return slot as MainSlot;
    const record = this.byId.get(id);
    if (!record || record.status !== "enabled") return "home";
    return pluginSlot(id);
  }

  idForLocation(slot: string): string | null {
    const fromSlot = pluginIdFromSlot(slot);
    if (fromSlot) return this.byId.has(fromSlot) ? fromSlot : null;
    for (const record of this.records) {
      if (record.plugin.manifest.legacySlots?.includes(slot)) return record.plugin.manifest.id;
    }
    return null;
  }

  private activate(record: PluginRecord): void {
    record.status = "enabled";
    record.reason = undefined;
    try {
      const result = record.plugin.activate?.(createPluginContext(record, this.store));
      if (result && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).then(undefined, (error: unknown) => {
          record.status = "failed";
          record.reason = errorText(error);
        });
      }
    } catch (error) {
      record.status = "failed";
      record.reason = errorText(error);
    }
  }

  private deactivate(record: PluginRecord): void {
    try {
      const result = record.plugin.deactivate?.();
      if (result && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).catch(() => {
          /* 停用异常不把插件留在界面上 */
        });
      }
    } catch {
      /* 停用异常不阻止卸下入口 */
    }
  }
}

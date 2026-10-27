import { useState, useEffect } from "react";
import type { TongyunPlugin, PluginContext } from "./types";

const ENABLED_PLUGINS_KEY = "tongyun_enabled_plugins";

class PluginRegistry {
  private plugins = new Map<string, TongyunPlugin>();
  private enabledPluginIds = new Set<string>();
  private listeners = new Set<() => void>();
  private contexts = new Map<string, PluginContext>();

  constructor() {
    this.loadEnabledState();
  }

  private loadEnabledState(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(ENABLED_PLUGINS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.enabledPluginIds = new Set(parsed);
        }
      }
    } catch (e) {
      console.warn("[PluginRegistry] Failed to parse enabled plugins from storage:", e);
    }
  }

  private saveEnabledState(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        ENABLED_PLUGINS_KEY,
        JSON.stringify(Array.from(this.enabledPluginIds)),
      );
    } catch (e) {
      console.warn("[PluginRegistry] Failed to save enabled plugins:", e);
    }
  }

  private createPluginContext(pluginId: string): PluginContext {
    return {
      storage: {
        getItem: (key: string) => {
          return localStorage.getItem(`plugin:${pluginId}:${key}`);
        },
        setItem: (key: string, value: string) => {
          localStorage.setItem(`plugin:${pluginId}:${key}`, value);
        },
        removeItem: (key: string) => {
          localStorage.removeItem(`plugin:${pluginId}:${key}`);
        },
      },
      emit: (event: string, payload?: unknown) => {
        window.dispatchEvent(
          new CustomEvent(`tongyun:plugin:${pluginId}:${event}`, { detail: payload }),
        );
      },
      on: (event: string, handler: (payload?: unknown) => void) => {
        const listener = (e: Event) => {
          handler((e as CustomEvent).detail);
        };
        const eventName = `tongyun:plugin:${pluginId}:${event}`;
        window.addEventListener(eventName, listener);
        return () => window.removeEventListener(eventName, listener);
      },
    };
  }

  /**
   * 注册插件
   */
  register(plugin: TongyunPlugin): void {
    const id = plugin.manifest.id;
    this.plugins.set(id, plugin);

    // 如果未曾在 localStorage 中显式配置过，则使用 manifest.defaultEnabled（默认为 true）
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(ENABLED_PLUGINS_KEY) : null;
    if (!stored && plugin.manifest.defaultEnabled !== false) {
      this.enabledPluginIds.add(id);
      this.saveEnabledState();
    }

    // 若当前为启用状态，执行 activate
    if (this.enabledPluginIds.has(id)) {
      this.activatePlugin(plugin);
    }

    this.notify();
  }

  private activatePlugin(plugin: TongyunPlugin): void {
    const id = plugin.manifest.id;
    if (!this.contexts.has(id)) {
      this.contexts.set(id, this.createPluginContext(id));
    }
    const ctx = this.contexts.get(id)!;
    try {
      void plugin.activate?.(ctx);
    } catch (e) {
      console.error(`[PluginRegistry] Failed to activate plugin "${id}":`, e);
    }
  }

  private deactivatePlugin(plugin: TongyunPlugin): void {
    try {
      void plugin.deactivate?.();
    } catch (e) {
      console.error(`[PluginRegistry] Failed to deactivate plugin "${plugin.manifest.id}":`, e);
    }
  }

  /**
   * 启用插件
   */
  enable(id: string): void {
    if (this.enabledPluginIds.has(id)) return;
    this.enabledPluginIds.add(id);
    this.saveEnabledState();

    const plugin = this.plugins.get(id);
    if (plugin) {
      this.activatePlugin(plugin);
    }
    this.notify();
  }

  /**
   * 禁用插件
   */
  disable(id: string): void {
    if (!this.enabledPluginIds.has(id)) return;
    this.enabledPluginIds.delete(id);
    this.saveEnabledState();

    const plugin = this.plugins.get(id);
    if (plugin) {
      this.deactivatePlugin(plugin);
    }
    this.notify();
  }

  /**
   * 切换插件启用状态
   */
  toggle(id: string): void {
    if (this.isEnabled(id)) {
      this.disable(id);
    } else {
      this.enable(id);
    }
  }

  isEnabled(id: string): boolean {
    return this.enabledPluginIds.has(id);
  }

  getPlugin(id: string): TongyunPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): TongyunPlugin[] {
    return Array.from(this.plugins.values());
  }

  getEnabledPlugins(): TongyunPlugin[] {
    return this.getAllPlugins().filter((p) => this.enabledPluginIds.has(p.manifest.id));
  }

  /**
   * 查询所有启用了 workbenchView（工作台主视图扩展）的插件
   */
  getEnabledWorkbenchViews(): Array<{
    pluginId: string;
    viewId: string;
    label: string;
    render: (props: import("./types").PluginViewProps) => React.ReactNode;
  }> {
    const list: Array<{
      pluginId: string;
      viewId: string;
      label: string;
      render: (props: import("./types").PluginViewProps) => React.ReactNode;
    }> = [];

    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.workbenchView) {
        list.push({
          pluginId: plugin.manifest.id,
          viewId: plugin.workbenchView.id,
          label: plugin.workbenchView.label,
          render: plugin.workbenchView.render,
        });
      }
    }
    return list;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}

export const pluginRegistry = new PluginRegistry();

/**
 * React Hook: 获取已注册的插件列表及状态
 */
export function usePluginRegistry() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return pluginRegistry.subscribe(() => setTick((t) => t + 1));
  }, []);

  return {
    allPlugins: pluginRegistry.getAllPlugins(),
    enabledPlugins: pluginRegistry.getEnabledPlugins(),
    workbenchViews: pluginRegistry.getEnabledWorkbenchViews(),
    isEnabled: (id: string) => pluginRegistry.isEnabled(id),
    enable: (id: string) => pluginRegistry.enable(id),
    disable: (id: string) => pluginRegistry.disable(id),
    toggle: (id: string) => pluginRegistry.toggle(id),
  };
}

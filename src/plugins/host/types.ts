import type { ReactNode } from "react";
import type { CustomizationConfig } from "../../types";

/** 宿主当前实现的契约。插件 manifest.apiVersion 必须等于这个整数。 */
export const HOST_API_VERSION = 1;

/** 启停表。不读取旧实验键 tongyun_enabled_plugins。 */
export const PLUGIN_STATE_KEY = "tongyun_plugin_host_v1";

export const PLUGIN_PERMISSIONS = [
  "storage:read",
  "storage:write",
  "tasks:write",
  "journal:write",
  "commands:register",
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export type PluginStatus = "invalid" | "incompatible" | "disabled" | "enabled" | "failed";

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  apiVersion: number;
  defaultEnabled: boolean;
  permissions: PluginPermission[];
  /** 允许经 ctx.storage 读写的本机键，精确匹配。 */
  storageKeys: string[];
  /** 旧的 activeTab 字符串，例如资讯的 "news"。 */
  legacySlots?: string[];
}

export interface PluginStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface NewsSaveRef {
  title: string;
  url: string;
  description?: string;
}

export interface PluginContext {
  storage: PluginStorage;
}

export interface PluginViewApi {
  config: CustomizationConfig;
  /** 仅当 manifest 声明了对应权限时才存在。 */
  saveTask?: (ref: { title: string; url: string }) => void;
  saveJournal?: (ref: NewsSaveRef) => void;
}

export interface PluginCommand {
  id: string;
  label: string;
  keywords?: string;
  run?: () => void;
}

export interface PluginSidebarContribution {
  label: string;
  icon?: "newspaper" | "puzzle";
}

export interface TongyunPlugin {
  manifest: PluginManifest;
  activate?(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
  sidebar?: PluginSidebarContribution;
  commands?: PluginCommand[];
  renderView?(api: PluginViewApi): ReactNode;
  renderSettings?(): ReactNode;
}

export interface PluginRecord {
  plugin: TongyunPlugin;
  status: PluginStatus;
  reason?: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PluginBridges {
  saveTask: (ref: { title: string; url: string }) => void;
  saveJournal: (ref: NewsSaveRef) => void;
  config: CustomizationConfig;
}

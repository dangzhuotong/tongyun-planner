import type { AppTab } from "../../types";

export type PluginSlot = `plugin:${string}`;
export type MainSlot = AppTab | PluginSlot;

export function pluginSlot(id: string): PluginSlot {
  return `plugin:${id}`;
}

export function isPluginSlot(slot: string): slot is PluginSlot {
  return slot.startsWith("plugin:");
}

export function pluginIdFromSlot(slot: string): string | null {
  if (!isPluginSlot(slot)) return null;
  const id = slot.slice("plugin:".length);
  return id || null;
}

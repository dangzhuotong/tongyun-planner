import { PLUGIN_STATE_KEY } from "./types";

export interface PluginEnabledMap {
  [id: string]: { enabled: boolean };
}

/** 缺省、坏 JSON、非布尔值都不当作有效覆盖。未知 id 原样留在表里，但不会凭空创建插件。 */
export function readEnabledMap(raw: string | null): PluginEnabledMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: PluginEnabledMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const enabled = (value as { enabled?: unknown }).enabled;
      if (typeof enabled !== "boolean") continue;
      map[id] = { enabled };
    }
    return map;
  } catch {
    return {};
  }
}

export function enabledFromMap(
  map: PluginEnabledMap,
  id: string,
  defaultEnabled: boolean,
): boolean {
  const entry = map[id];
  if (!entry) return defaultEnabled;
  return entry.enabled;
}

export function writeEnabledMap(
  map: PluginEnabledMap,
  id: string,
  enabled: boolean,
): PluginEnabledMap {
  return { ...map, [id]: { enabled } };
}

export function serializeEnabledMap(map: PluginEnabledMap): string {
  return JSON.stringify(map);
}

export function loadEnabledMap(store: { getItem(key: string): string | null }): PluginEnabledMap {
  return readEnabledMap(store.getItem(PLUGIN_STATE_KEY));
}

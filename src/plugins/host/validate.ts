import { isCoreStorageKey } from "./coreKeys";
import {
  HOST_API_VERSION,
  PLUGIN_PERMISSIONS,
  type PluginManifest,
  type PluginPermission,
} from "./types";

const ID_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9]+)+$/;

export type ManifestVerdict =
  { ok: true } | { ok: false; status: "invalid" | "incompatible"; reason: string };

export function validateManifest(manifest: PluginManifest, seen: Set<string>): ManifestVerdict {
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, status: "invalid", reason: "manifest 缺失" };
  }
  if (typeof manifest.id !== "string" || !ID_PATTERN.test(manifest.id)) {
    return { ok: false, status: "invalid", reason: "id 必须是反向域名" };
  }
  if (seen.has(manifest.id)) {
    return { ok: false, status: "invalid", reason: "id 重复" };
  }
  seen.add(manifest.id);
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    return { ok: false, status: "invalid", reason: "缺少名称" };
  }
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    return { ok: false, status: "invalid", reason: "缺少版本" };
  }
  if (typeof manifest.defaultEnabled !== "boolean") {
    return { ok: false, status: "invalid", reason: "defaultEnabled 必须是布尔值" };
  }
  if (typeof manifest.apiVersion !== "number") {
    return { ok: false, status: "invalid", reason: "apiVersion 必须是整数" };
  }
  if (manifest.apiVersion !== HOST_API_VERSION) {
    return {
      ok: false,
      status: "incompatible",
      reason: `需要宿主契约 ${manifest.apiVersion}，当前是 ${HOST_API_VERSION}`,
    };
  }
  if (!Array.isArray(manifest.permissions)) {
    return { ok: false, status: "invalid", reason: "permissions 必须是数组" };
  }
  const known = new Set<string>(PLUGIN_PERMISSIONS);
  for (const permission of manifest.permissions) {
    if (!known.has(permission)) {
      return { ok: false, status: "invalid", reason: `未知权限 ${String(permission)}` };
    }
  }
  if (!Array.isArray(manifest.storageKeys)) {
    return { ok: false, status: "invalid", reason: "storageKeys 必须是数组" };
  }
  for (const key of manifest.storageKeys) {
    if (typeof key !== "string" || !key) {
      return { ok: false, status: "invalid", reason: "storageKeys 含空键" };
    }
    if (isCoreStorageKey(key)) {
      return { ok: false, status: "invalid", reason: `不能声明核心键 ${key}` };
    }
  }
  return { ok: true };
}

export function hasPermission(manifest: PluginManifest, permission: PluginPermission): boolean {
  return manifest.permissions.includes(permission);
}

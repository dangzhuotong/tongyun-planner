import type { WebDavConfig } from "../../types";

export const JIANGUOYUN_WEBDAV_URL = "https://dav.jianguoyun.com/dav/";

export type WebDavPreset = "jianguoyun" | "custom";

/**
 * The Jianguoyun preset only pre-fills the default URL.
 * The address stays editable so a mirror or custom path can be saved.
 */
export function isWebDavUrlLocked(_preset: WebDavPreset): boolean {
  return false;
}

export function urlForPreset(preset: WebDavPreset, currentUrl: string): string {
  if (preset === "jianguoyun") return JIANGUOYUN_WEBDAV_URL;
  return currentUrl;
}

/**
 * https is required. http is accepted only for localhost, 127.0.0.1, and ::1.
 * A half-typed or cleartext URL must not be written into the sync engine.
 */
export function isAllowedWebDavUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol !== "http:") return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export type WebDavCommitPoint = "change" | "blur" | "save";

/** Keystrokes stay in the draft. The engine is updated on blur or an explicit save. */
export function shouldCommitWebDavDraft(point: WebDavCommitPoint): boolean {
  return point !== "change";
}

/**
 * Persist URL, account, and password on blur or an explicit save.
 * A "change" point and a disallowed URL both leave storage unchanged.
 */
export function commitWebDavDraftAt(
  point: WebDavCommitPoint,
  draft: { url: string; username: string; password: string },
  apply: (config: WebDavConfig) => void,
): WebDavConfig | null {
  if (!shouldCommitWebDavDraft(point)) return null;
  return commitWebDavDraft(draft, apply);
}

/**
 * Persist URL, account, and password on blur or an explicit save.
 * Returns null and leaves storage unchanged when the URL is not allowed.
 */
export function commitWebDavDraft(
  draft: { url: string; username: string; password: string },
  apply: (config: WebDavConfig) => void,
): WebDavConfig | null {
  const url = draft.url.trim();
  if (!isAllowedWebDavUrl(url)) return null;
  const config: WebDavConfig = {
    url,
    username: draft.username.trim(),
    password: draft.password ? draft.password : undefined,
  };
  apply(config);
  return config;
}

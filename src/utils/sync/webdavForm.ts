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

/** Persist URL, account, and password as soon as the draft changes, not only on a button click. */
export function commitWebDavDraft(
  draft: { url: string; username: string; password: string },
  apply: (config: WebDavConfig) => void,
): WebDavConfig {
  const config: WebDavConfig = {
    url: draft.url.trim(),
    username: draft.username.trim(),
    password: draft.password ? draft.password : undefined,
  };
  apply(config);
  return config;
}

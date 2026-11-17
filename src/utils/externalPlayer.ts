import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const isTauri =
  typeof window !== "undefined" &&
  (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

/** 在独立窗口打开或关掉 YouTube / B 站。浏览器开发模式没有这个窗口。 */
export async function setExternalPlayerUrl(url: string | null): Promise<void> {
  if (!isTauri) return;
  await invoke("set_external_player", { url });
}

export function listenExternalPlayerClosed(handler: () => void): Promise<UnlistenFn> {
  if (!isTauri) return Promise.resolve(() => {});
  return listen("external-player-closed", () => handler());
}

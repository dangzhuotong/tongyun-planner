import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const isTauri =
  typeof window !== "undefined" &&
  (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;

/** 浏览器开发模式没有独立播放窗口，不能假装已经藏起跨站画面。 */
export function canControlExternalPlayerPicture(): boolean {
  return isTauri;
}

/** 在独立窗口打开或关掉 YouTube / B 站。浏览器开发模式没有这个窗口。 */
export async function setExternalPlayerUrl(url: string | null): Promise<void> {
  if (!isTauri) return;
  await invoke("set_external_player", { url });
}

/**
 * 收起或恢复独立窗口里的画面。只改窗口尺寸和标题，不关闭、不销毁页面。
 * 非桌面环境返回 unavailable，调用方不能据此显示「已隐藏」。
 */
export async function setExternalPlayerPictureHidden(
  hidden: boolean,
): Promise<"applied" | "unavailable"> {
  if (!isTauri) return "unavailable";
  await invoke("set_external_player_picture_hidden", { hidden });
  return "applied";
}

export function listenExternalPlayerClosed(handler: () => void): Promise<UnlistenFn> {
  if (!isTauri) return Promise.resolve(() => {});
  return listen("external-player-closed", () => handler());
}

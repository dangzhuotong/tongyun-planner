import type { LoopbackResult, LoopbackTransport } from "./types";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 桌面命令只做本机 GET。浏览器开发模式没有这条通道，调用方应显示「需要桌面版」。 */
export function createDesktopLoopbackTransport(): LoopbackTransport | null {
  if (!inTauri()) return null;
  return {
    async get(pluginId, url, prefixes, attachSecret): Promise<LoopbackResult> {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<LoopbackResult>("plugin_loopback_get", {
        pluginId,
        url,
        prefixes,
        attachSecret,
      });
    },
    async putSecret(pluginId, secret) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin_secret_put", { pluginId, secret });
    },
    async forgetSecret(pluginId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin_secret_forget", { pluginId });
    },
    async hasSecret(pluginId) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<boolean>("plugin_secret_exists", { pluginId });
    },
  };
}

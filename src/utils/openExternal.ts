const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

let _openUrl: ((url: string) => Promise<void>) | null = null;

async function getOpener(): Promise<(url: string) => Promise<void>> {
  if (!_openUrl) {
    try {
      const mod = await import("@tauri-apps/plugin-opener");
      _openUrl = mod.openUrl;
    } catch {
      _openUrl = async (u: string) => {
        window.open(u, "_blank");
      };
    }
  }
  return _openUrl;
}

export function openExternal(url: string) {
  if (!url) return;
  if (isTauri) {
    getOpener().then((fn) => fn(url));
  } else {
    window.open(url, "_blank");
  }
}

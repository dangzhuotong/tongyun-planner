import type { Update } from "@tauri-apps/plugin-updater";

export const isTauri = () =>
  typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

/** Version string shown beside 检查更新. Installed Tauri version wins over the bundled package.json version. */
export function resolveDisplayedAppVersion(
  runtimeVersion: string | null | undefined,
  bundledVersion: string,
): string {
  const raw = runtimeVersion?.trim() || bundledVersion.trim();
  return raw.replace(/^v/i, "");
}

export async function checkForAppUpdate(): Promise<Update | null> {
  if (!isTauri()) {
    return null;
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    return update;
  } catch (err) {
    console.error("[Updater] Check error:", err);
    throw err;
  }
}

export async function downloadAndInstallAppUpdate(
  update: Update,
  onProgress?: (progress: {
    event: "Started" | "Progress" | "Finished";
    chunkLength?: number;
    contentLength?: number;
  }) => void,
): Promise<void> {
  await update.downloadAndInstall((event) => {
    if (onProgress) {
      if (event.event === "Started") {
        onProgress({ event: "Started", contentLength: event.data.contentLength });
      } else if (event.event === "Progress") {
        onProgress({ event: "Progress", chunkLength: event.data.chunkLength });
      } else if (event.event === "Finished") {
        onProgress({ event: "Finished" });
      }
    }
  });

  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    console.warn("[Updater] Relaunch error (app may have exited automatically):", err);
  }
}

/**
 * Desktop runtime detection.
 * Tauri 2 exposes `globalThis.isTauri`; older builds expose `__TAURI_INTERNALS__`.
 * Either one means WebDAV must use Rust commands instead of webview fetch.
 */
export function isDesktopRuntime(): boolean {
  const scopes: Array<Record<string, unknown> | undefined> = [];
  if (typeof globalThis !== "undefined") scopes.push(globalThis as Record<string, unknown>);
  if (typeof window !== "undefined") scopes.push(window as unknown as Record<string, unknown>);
  for (const scope of scopes) {
    if (!scope) continue;
    if (scope.isTauri === true) return true;
    if (scope.__TAURI_INTERNALS__ != null) return true;
    if (scope.__TAURI__ != null) return true;
  }
  return false;
}

export const WEBDAV_REQUIRES_DESKTOP =
  "WebDAV requests must run in the desktop app. Webview fetch is blocked by CORS.";

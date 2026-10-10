/**
 * src/utils/platform.ts
 *
 * 平台环境检测与 HTML 样式标记工具。
 * 启动时检测 macOS，为 document.documentElement 注入 `platform-macos` class，
 * 以便 CSS 针对 macOS 启用透明窗口裁切与 12px 圆角。
 */

export function isMacOS(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    "";
  return /Mac/i.test(ua) || /Mac/i.test(platform);
}

export function initPlatformClass(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const mac = isMacOS();
  if (mac) {
    document.documentElement.classList.add("platform-macos");
  }
  return mac;
}

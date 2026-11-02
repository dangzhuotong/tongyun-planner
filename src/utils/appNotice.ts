// 前台判定放在 Rust 窗口侧：最小化/被遮挡时 WebView 的 document.hasFocus() 并不可靠
export async function notifyMicroBreak(
  title: string,
  body: string,
): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("notify_micro_break", { title, body });
  } catch {
    return false;
  }
}

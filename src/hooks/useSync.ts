import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// 检测是否处于 Tauri 环境
const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

// 浏览器 dev 模式下用会话 UUID 防止自收同步事件
const SESSION_ID: string = (() => {
  if (isTauri) return "";
  try {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } catch {
    return `session-${Date.now()}`;
  }
})();

// 在浏览器 dev 模式下用 BroadcastChannel 做同源多标签广播降级
// 让开发环境行为与 Tauri 生产一致（否则 listen("todo-sync-event") 拿不到任何事件）
let devChannel: BroadcastChannel | null = null;
if (!isTauri && typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    devChannel = new BroadcastChannel("tongyun-todo-sync");
    // 桥接：把 BroadcastChannel 消息重新分发为 window "todo-sync-event" CustomEvent。
    // App.tsx / FloatingNoteWindow 用的是 @tauri-apps/api/event 的 listen，
    // 在非 Tauri 环境下它不会触发；这里额外派发一个原生事件，
    // useDevSyncListener() 会挂到 window 上，与生产一致的语义。
    devChannel.addEventListener("message", (ev) => {
      window.dispatchEvent(new CustomEvent("todo-sync-event", { detail: ev.data }));
    });
  } catch (e) {
    console.warn("BroadcastChannel 初始化失败，dev 环境下跨窗口同步会缺失", e);
  }
}

/**
 * 在非 Tauri 环境下让消费方也能收到同步事件。
 * 用法：在 App.tsx / FloatingNoteWindow 的 listen("todo-sync-event") 旁边
 *   useDevSyncListener(handler) 一同挂载即可。
 */
export function subscribeDevSync(handler: (payload: any) => void): () => void {
  if (isTauri) return () => {};
  const wrapped = (e: Event) => {
    const custom = e as CustomEvent;
    handler({ payload: custom.detail });
  };
  window.addEventListener("todo-sync-event", wrapped);
  return () => window.removeEventListener("todo-sync-event", wrapped);
}

export function useSync() {
  // 字段级同步：调用方对不想变更的字段应显式传 undefined。
  // 未传值一律映射为 null（Rust 侧 Option<String>）；空串 "" 交由接收方按"显式清空"处理。
  const syncState = useCallback(
    async (
      taskId: string,
      action: string,
      title?: string,
      description?: string,
      category?: string,
      notes?: string,
      dueDate?: string,
      dueTime?: string,
    ) => {
      let sourceWindow = SESSION_ID;
      try {
        sourceWindow = getCurrentWebviewWindow().label;
      } catch {
        // Browser-only development mode has no Tauri webview label.
      }

      const payload = {
        task_id: taskId,
        action,
        source_window: sourceWindow,
        title: title ?? null,
        description: description ?? null,
        notes: notes ?? null,
        category: category ?? null,
        due_date: dueDate ?? null,
        due_time: dueTime ?? null,
        timestamp: Date.now(),
      };

      if (isTauri) {
        try {
          await invoke("sync_todo_state", { payload });
        } catch (e) {
          console.error("同步窗口状态失败", e);
        }
      } else if (devChannel) {
        try {
          devChannel.postMessage(payload);
        } catch (e) {
          console.error("dev 广播失败", e);
        }
      }
    },
    [],
  );

  return { syncState };
}

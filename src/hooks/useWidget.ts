import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useSync } from "./useSync";

export function useWidget() {
  const { syncState } = useSync();
  const [isWidgetLocked, setIsWidgetLocked] = useState(false);

  const handleToggleWidget = useCallback(async () => {
    try {
      await invoke("toggle_widget_window");
    } catch (e) {
      console.error("切换挂件状态失败", e);
    }
  }, []);

  const handleToggleWidgetLock = useCallback(async (forceState?: boolean) => {
    let nextState = false;
    setIsWidgetLocked((prev) => {
      nextState = forceState !== undefined ? forceState : !prev;
      return nextState;
    });
    WebviewWindow.getByLabel("widget")
      .then((widget) => (widget || getCurrentWebviewWindow()).setAlwaysOnTop(nextState))
      .catch((e) => {
        console.error("设置窗口置顶失败", e);
      });
    syncState("widget_lock", nextState ? "lock_widget" : "unlock_widget");
  }, [syncState]);

  return useMemo(() => ({
    isWidgetLocked,
    setIsWidgetLocked,
    handleToggleWidget,
    handleToggleWidgetLock,
  }), [isWidgetLocked, handleToggleWidget, handleToggleWidgetLock]);
}

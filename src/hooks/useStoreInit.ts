import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { safeJsonParse } from "../utils/json";
import { storage } from "../utils/unifiedStorage";
import { dedupeActiveTasks } from "../utils/sync/types";
import type { Task, CustomizationConfig, Locale } from "../types";
import type { useTasks } from "./useTasks";
import type { usePomodoro } from "./usePomodoro";
import type { useStickyNotes } from "./useStickyNotes";
import type { useCountdown } from "./useCountdown";
import type { useCustomization } from "./useCustomization";
import type { useWidget } from "./useWidget";

interface Handlers {
  tasksHook: ReturnType<typeof useTasks>;
  pomodoroHook: ReturnType<typeof usePomodoro>;
  notesHook: ReturnType<typeof useStickyNotes>;
  countdownHook: ReturnType<typeof useCountdown>;
  customizationHook: ReturnType<typeof useCustomization>;
  widgetHook: ReturnType<typeof useWidget>;
  setLocale: (locale: Locale) => void;
}

export function useStoreInit(
  handlersRef: React.MutableRefObject<Handlers>,
  setWindowLabel: (label: string) => void,
  windowLabelRef: React.MutableRefObject<string>,
  setIsHydrated: (v: boolean) => void,
) {
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const initPromise = storage.init().catch((e) => console.error("SQLite 初始化失败", e));

    let label = "main";
    try {
      label = getCurrentWebviewWindow().label;
    } catch (_) { /* non-Tauri environment */ }
    setWindowLabel(label);
    windowLabelRef.current = label;
    if (label !== "main") {
      document.documentElement.classList.add("transparent-window");
    }

    if (typeof Notification !== "undefined" && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }

    const savedCustomization = localStorage.getItem("aero_customization_config");
    if (savedCustomization) {
      const parsed = safeJsonParse<CustomizationConfig | null>(savedCustomization, null);
      if (parsed) {
        handlersRef.current.customizationHook.setCustomizationConfig(parsed);
        if (parsed.locale) handlersRef.current.setLocale(parsed.locale);
      }
    }

    const savedSound = localStorage.getItem("aero_alert_sound_type");
    if (savedSound) handlersRef.current.pomodoroHook.setAlertSoundType(savedSound as any);

    const savedFocus = localStorage.getItem("pomodoro_focus_duration");
    const savedBreak = localStorage.getItem("pomodoro_break_duration");
    if (savedFocus) {
      const f = parseInt(savedFocus, 10);
      handlersRef.current.pomodoroHook.setFocusDuration(f);
      handlersRef.current.pomodoroHook.setPomodoroTimeLeft(f * 60);
    }
    if (savedBreak) handlersRef.current.pomodoroHook.setBreakDuration(parseInt(savedBreak, 10));

    const initStore = async () => {
      await initPromise;

      try {
        const localLogs = localStorage.getItem("aero_pomodoro_logs");
        if (localLogs) {
          handlersRef.current.pomodoroHook.setPomodoroLogs(safeJsonParse(localLogs, []));
        }

        const localNotes = localStorage.getItem("aero_sticky_notes");
        if (localNotes) {
          handlersRef.current.notesHook.setStickyNotes(safeJsonParse(localNotes, []));
        }

        const localCountdowns = localStorage.getItem("tongyun_countdowns");
        if (localCountdowns) handlersRef.current.countdownHook.setCountdowns(safeJsonParse(localCountdowns, []));

        const localTasks = localStorage.getItem("aero_todos");
        const localCompleted = localStorage.getItem("aero_completed_todos");

        let resolvedTasks: Task[];
        let resolvedCompleted: Task[];

        if (!localTasks || safeJsonParse<Task[]>(localTasks, []).length === 0) {
          resolvedTasks = handlersRef.current.tasksHook.INITIAL_TASKS;
          resolvedCompleted = [];
        } else {
          resolvedTasks = safeJsonParse<Task[]>(localTasks, handlersRef.current.tasksHook.INITIAL_TASKS);
          resolvedCompleted = safeJsonParse<Task[]>(localCompleted, []);
        }
        resolvedTasks = dedupeActiveTasks(resolvedTasks, resolvedCompleted);

        handlersRef.current.tasksHook.setTasks(resolvedTasks);
        handlersRef.current.tasksHook.setCompletedTasks(resolvedCompleted);
      } catch (e) {
        console.warn("数据加载失败，使用初始任务", e);
        handlersRef.current.tasksHook.setTasks(handlersRef.current.tasksHook.INITIAL_TASKS);
        handlersRef.current.tasksHook.setCompletedTasks([]);
      } finally {
        setIsHydrated(true);
      }
    };
    initStore();
  }, []);
}

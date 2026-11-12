import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { safeJsonParse } from "../utils/json";
import { storage } from "../utils/unifiedStorage";
import { sanitizeRepeatAnchors } from "../utils/nextDueDate";
import { dedupeActiveTasks } from "../utils/sync/types";
import type { CustomizationConfig, Locale } from "../types";
import type { useTasks } from "./useTasks";
import type { usePomodoro } from "./usePomodoro";
import type { useStickyNotes } from "./useStickyNotes";
import type { useCountdown } from "./useCountdown";
import { DEFAULT_CUSTOMIZATION_CONFIG, type useCustomization } from "./useCustomization";
import type { useWidget } from "./useWidget";
import { taskRepository } from "../data/repositories";
import { MICRO_BREAK_STORAGE_KEYS } from "./usePomodoro";

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
    } catch {
      /* non-Tauri environment */
    }
    setWindowLabel(label);
    windowLabelRef.current = label;
    if (label !== "main") {
      document.documentElement.classList.add("transparent-window");
    }

    const isTauriEnv =
      typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
    if (
      isTauriEnv &&
      typeof Notification !== "undefined" &&
      Notification.permission !== "granted" &&
      Notification.permission !== "denied"
    ) {
      Notification.requestPermission();
    }

    // hook 的 useState 初值在 storage.init() 之前读取，此时 SQLite 里的设置可能尚未
    // 回填到 localStorage。初始化前后各应用一次，避免开关与持久化值不一致。
    const applySavedSettings = () => {
      const savedCustomization = localStorage.getItem("aero_customization_config");
      if (savedCustomization) {
        const parsed = safeJsonParse<CustomizationConfig | null>(savedCustomization, null);
        if (parsed) {
          const merged: CustomizationConfig = { ...DEFAULT_CUSTOMIZATION_CONFIG, ...parsed };
          handlersRef.current.customizationHook.setCustomizationConfig(merged);
          if (merged.locale) handlersRef.current.setLocale(merged.locale);
        }
      }

      const pomodoro = handlersRef.current.pomodoroHook;
      const savedSound = localStorage.getItem("aero_alert_sound_type");
      if (savedSound) pomodoro.setAlertSoundType(savedSound as any);

      const savedFocus = parseInt(localStorage.getItem("pomodoro_focus_duration") || "", 10);
      if (Number.isFinite(savedFocus) && savedFocus > 0) {
        pomodoro.setFocusDuration(savedFocus);
        if (!pomodoro.pomodoroIsActive) pomodoro.setPomodoroTimeLeft(savedFocus * 60);
      }
      const savedBreak = parseInt(localStorage.getItem("pomodoro_break_duration") || "", 10);
      if (Number.isFinite(savedBreak) && savedBreak > 0) pomodoro.setBreakDuration(savedBreak);

      pomodoro.setRandomBreakEnabled(localStorage.getItem("tongyun_random_break") === "true");

      const readSeconds = (key: string): number | null => {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const gapMin = readSeconds(MICRO_BREAK_STORAGE_KEYS.gapMinSec);
      const gapMax = readSeconds(MICRO_BREAK_STORAGE_KEYS.gapMaxSec);
      if (gapMin !== null && gapMax !== null) {
        pomodoro.setMicroBreakGap(gapMin, gapMax);
      } else {
        // 旧版本只存预设键，首次升级时映射成可编辑的数值范围
        const legacyPreset = localStorage.getItem(MICRO_BREAK_STORAGE_KEYS.legacyInterval);
        const legacyGaps: Record<string, [number, number]> = {
          "1-2": [60, 120],
          "3-5": [180, 300],
          "5-10": [300, 600],
          "test-30s": [30, 60],
        };
        const mapped = legacyPreset ? legacyGaps[legacyPreset] : undefined;
        if (mapped) pomodoro.setMicroBreakGap(mapped[0], mapped[1]);
      }

      const durationMin = readSeconds(MICRO_BREAK_STORAGE_KEYS.durationMinSec);
      const durationMax = readSeconds(MICRO_BREAK_STORAGE_KEYS.durationMaxSec);
      if (durationMin !== null && durationMax !== null) {
        pomodoro.setMicroBreakDuration(durationMin, durationMax);
      }

      pomodoro.setAutoNoiseEnabled(localStorage.getItem("tongyun_auto_noise") === "true");
    };

    applySavedSettings();

    const savedLogs = localStorage.getItem("aero_pomodoro_logs");
    if (savedLogs) {
      handlersRef.current.pomodoroHook.setPomodoroLogs(safeJsonParse(savedLogs, []));
    }

    const initStore = async () => {
      await initPromise;

      try {
        applySavedSettings();

        const localLogs = localStorage.getItem("aero_pomodoro_logs");
        if (localLogs) {
          handlersRef.current.pomodoroHook.setPomodoroLogs(safeJsonParse(localLogs, []));
        }

        const localNotes = localStorage.getItem("aero_sticky_notes");
        if (localNotes) {
          handlersRef.current.notesHook.setStickyNotes(safeJsonParse(localNotes, []));
        }

        const localCountdowns = localStorage.getItem("tongyun_countdowns");
        if (localCountdowns)
          handlersRef.current.countdownHook.setCountdowns(safeJsonParse(localCountdowns, []));

        const savedTasks = await taskRepository.load();
        if (!savedTasks && isTauriEnv && !storage.isMirrorReady()) {
          throw new Error("无法确认手帐存储状态");
        }
        let resolvedTasks = savedTasks?.tasks ?? handlersRef.current.tasksHook.INITIAL_TASKS;
        let resolvedCompleted = savedTasks?.completed ?? [];

        resolvedTasks = sanitizeRepeatAnchors(resolvedTasks);
        resolvedCompleted = sanitizeRepeatAnchors(resolvedCompleted);
        resolvedTasks = dedupeActiveTasks(resolvedTasks, resolvedCompleted);

        handlersRef.current.tasksHook.setTasks(resolvedTasks);
        handlersRef.current.tasksHook.setCompletedTasks(resolvedCompleted);

        // 迁移兼容快照时只补写，不把缺失条目当成删除。
        handlersRef.current.tasksHook.saveAll(resolvedTasks, resolvedCompleted, false);
        setIsHydrated(true);
      } catch (e) {
        // 读取失败不能当成首次启动，也不能开放自动同步/Agent 写入。
        console.warn("数据加载失败", e);
      }
    };
    initStore();
  }, [handlersRef, setIsHydrated, setWindowLabel, windowLabelRef]);
}

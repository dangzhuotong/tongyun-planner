import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import type { Task, AppTab, CustomizationConfig } from "./types";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { MatrixView } from "./components/MatrixView";
import { ListView } from "./components/ListView";
import { TaskDetailModal } from "./components/TaskDetailModal";
import { CalendarView } from "./components/CalendarView";
import { StickyNotesView } from "./components/StickyNotesView";
const NewsView = React.lazy(() => import("./components/NewsView").then((m) => ({ default: m.NewsView })));
import { CelebrationOverlay } from "./components/CelebrationOverlay";
const AnalyticsView = React.lazy(() => import("./components/AnalyticsView").then((m) => ({ default: m.AnalyticsView })));
const CompletedView = React.lazy(() => import("./components/CompletedView").then((m) => ({ default: m.CompletedView })));
const WidgetWindow = React.lazy(() => import("./components/WidgetWindow").then((m) => ({ default: m.WidgetWindow })));
import { CommandPalette } from "./components/CommandPalette";
const SettingsView = React.lazy(() => import("./components/SettingsView").then((m) => ({ default: m.SettingsView })));
import { FloatingNoteWindow } from "./components/FloatingNoteWindow";
const CountdownView = React.lazy(() => import("./components/CountdownView").then((m) => ({ default: m.CountdownView })));
const FlowMode = React.lazy(() => import("./components/FlowMode").then((m) => ({ default: m.FlowMode })));
const HabitsView = React.lazy(() => import("./components/HabitsView").then((m) => ({ default: m.HabitsView })));
const GanttView = React.lazy(() => import("./components/GanttView").then((m) => ({ default: m.GanttView })));
const JournalView = React.lazy(() => import("./components/JournalView").then((m) => ({ default: m.JournalView })));

const viewFallback = (
  <div className="flex-grow flex items-center justify-center text-slate-400 text-sm py-20">
    <span className="animate-pulse">…</span>
  </div>
);
import { audioEngine } from "./utils/audioEngine";
import { Sparkles } from "lucide-react";
import { LanguageProvider, useTranslation } from "./i18n/LanguageContext";
import { useTasks } from "./hooks/useTasks";
import { usePomodoro } from "./hooks/usePomodoro";
import { useStickyNotes } from "./hooks/useStickyNotes";
import { useCountdown } from "./hooks/useCountdown";
import { useCustomization } from "./hooks/useCustomization";
import { useAI } from "./hooks/useAI";
import { useWidget } from "./hooks/useWidget";
import { useDebouncedPersistence } from "./hooks/useDebouncedPersistence";
import type { JournalEntry } from "./types";
import { useSync, subscribeDevSync } from "./hooks/useSync";
import { PomodoroContext } from "./context/PomodoroContext";
import { PersonalProvider, usePersonal } from "./context/PersonalContext";
import { createId } from "./utils/id";
import { getLocalDateString } from "./utils/date";
import { safeJsonParse } from "./utils/json";
import { storage } from "./utils/unifiedStorage";
import { syncEngine } from "./utils/sync/engine";
import { SYNC_APPLIED_EVENT, bumpSyncVersion, bumpCategoryVersion, dedupeActiveTasks, type SyncCategory, type SyncData } from "./utils/sync/types";

function AppInner() {
  return (
    <PersonalProvider>
      <AppBody />
    </PersonalProvider>
  );
}

function AppBody() {
  const { t, setLocale, locale } = useTranslation();
  const tasksHook = useTasks();
  const tasksRef = useRef(tasksHook.tasks);
  tasksRef.current = tasksHook.tasks;
  const pomodoroHook = usePomodoro();
  const notesHook = useStickyNotes();
  const countdownHook = useCountdown();
  const customizationHook = useCustomization();
  const widgetHook = useWidget();
  const { syncState } = useSync();
  const aiHook = useAI(customizationHook.customizationConfig);

  const [windowLabel, setWindowLabel] = useState<string>("main");
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced");
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(() => {
    const saved = localStorage.getItem("aero_last_backup_time");
    return saved ? parseInt(saved, 10) : null;
  });
  const isFirstLoad = useRef(true);
  const isRestoringRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [flowMode, setFlowMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Cmd/Ctrl+K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    document.title = t.app.title;
    try { getCurrentWebviewWindow().setTitle(t.app.title); } catch { /* 非 Tauri 环境忽略 */ }
  }, [t.app.title]);

  useEffect(() => {
    const cfgLocale = customizationHook.customizationConfig.locale;
    if (cfgLocale && cfgLocale !== locale) {
      setLocale(cfgLocale);
    }
  }, [customizationHook.customizationConfig.locale, locale, setLocale]);

  const { journal, journalAddTodo, handleUpsertJournal, setJournal, setHabits, setHabitLogs } = usePersonal();

  // 全局开关：是否把每一天的日记加入当日待办 → 同步生成/移除关联任务
  const journalTodoTitle = useCallback((entry: JournalEntry) => {
    return `日记 ${entry.date}`;
  }, []);

  useEffect(() => {
    const currentTasks = tasksRef.current;
    for (const entry of journal) {
      if (!entry.isDaily) continue;
      const existing = currentTasks.find((t) => t.journalId === entry.id);
      if (journalAddTodo) {
        const title = journalTodoTitle(entry);
        if (!existing) {
          tasksHook.handleAddTask({
            title,
            description: entry.content.slice(0, 200),
            notes: "",
            category: "important-not-urgent",
            dueDate: entry.date,
            isExplicit: true,
            tags: ["日记"],
          }).then((res) => {
            if (res?.taskId) tasksHook.handleEditTask(res.taskId, { journalId: entry.id });
          });
        } else if (existing.title !== title || existing.description !== (entry.content.slice(0, 200) || undefined)) {
          tasksHook.handleEditTask(existing.id, {
            title,
            description: entry.content.slice(0, 200) || undefined,
          });
        }
      } else if (existing) {
        tasksHook.handleDeleteTask(existing.id);
      }
    }
  }, [journal, journalAddTodo]);

  // ============ handler ref 转发 (#4) ============
  // initStore 的 useEffect 依赖为 []，但需要在跨窗口 listener 里调用最新的 hook 函数。
  // 用 ref 转发：每次 render 更新 ref.current，listener 通过 handlersRef.current.xxx 调用最新引用。
  const handlersRef = useRef({
    tasksHook,
    pomodoroHook,
    notesHook,
    countdownHook,
    customizationHook,
    widgetHook,
    setLocale,
  });
  useEffect(() => {
    handlersRef.current = {
      tasksHook,
      pomodoroHook,
      notesHook,
      countdownHook,
      customizationHook,
      widgetHook,
      setLocale,
    };
  });

  // ============ Store Initialization ============
  // StrictMode guard：dev 模式下 effect 会跑两次，避免 initStore 重复执行导致数据回滚 (#13)
  const initStartedRef = useRef(false);
  const windowLabelRef = useRef("main");
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    // 提前启动 SQLite 初始化（initStore 内部 await 等待完成）
    const initPromise = storage.init().catch((e) => console.error("SQLite 初始化失败", e));

    let label = "main";
    try {
      label = getCurrentWebviewWindow().label;
    } catch (e) {}
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
      // 等待 SQLite 初始化完成（unifiedStorage 会把 SQLite 数据灌入 localStorage）
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

  // ============ 跨窗口 event listener（独立 useEffect，避免 StrictMode 双挂载丢失监听器）============
  useEffect(() => {
    const handleSyncPayload = (p: any) => {
      if (p.source_window && p.source_window === windowLabelRef.current) return;
      const { tasksHook: tH, pomodoroHook: pH, notesHook: nH, widgetHook: wH, customizationHook: cH } = handlersRef.current;
      switch (p.action) {
        case "complete":
          tH.handleComplete(p.task_id, false);
          break;
        case "undo_complete":
          tH.handleUndoComplete(p.task_id, false);
          break;
        case "delete":
          tH.handleDeleteTask(p.task_id, false);
          break;
        case "snooze":
          tH.handleSnooze(p.task_id, false);
          break;
        case "add": {
          const newTask: Task = {
            id: p.task_id,
            title: p.title || "无题任务",
            notes: p.notes || undefined,
            description: p.description || undefined,
            category: p.category || "urgent-important",
            dueDate: p.due_date || undefined,
            dueTime: p.due_time || undefined,
          };
          tH.setTasks((prev: Task[]) => {
            const updated = [newTask, ...prev.filter((t: Task) => t.id !== newTask.id)];
            tH.saveTasks(updated);
            return updated;
          });
          break;
        }
        case "favorite_sync":
          tH.setTasks((prev: Task[]) => {
            const updated = prev.map((t) => t.id === p.task_id ? { ...t, isFavorite: p.title === "true" } : t);
            tH.saveTasks(updated);
            return updated;
          });
          break;
        case "pin_sync":
          tH.setTasks((prev: Task[]) => {
            const updated = prev.map((t) => t.id === p.task_id ? { ...t, isPinned: p.title === "true" } : t);
            tH.saveTasks(updated);
            return updated;
          });
          break;
        case "update":
          tH.setTasks((prev: Task[]) => {
            const updated = prev.map((t) => {
              if (t.id !== p.task_id) return t;
              const next: Task = { ...t };
              if (p.title != null && p.title !== "") next.title = p.title;
              if (p.description != null) next.description = p.description || undefined;
              if (p.category != null && p.category !== "") next.category = p.category as Task["category"];
              if (p.notes != null) next.notes = p.notes || undefined;
              if (p.due_date != null) next.dueDate = p.due_date || undefined;
              if (p.due_time != null) next.dueTime = p.due_time || undefined;
              return next;
            });
            tH.saveTasks(updated);
            return updated;
          });
          break;
        case "reset":
          tH.setTasks(tH.INITIAL_TASKS);
          tH.setCompletedTasks([]);
          tH.saveTasks(tH.INITIAL_TASKS);
          tH.saveCompleted([]);
          break;
        case "clear_completed":
          tH.setCompletedTasks([]);
          tH.saveCompleted([]);
          break;
        case "lock_widget":
          wH.setIsWidgetLocked(true);
          break;
        case "unlock_widget":
          wH.setIsWidgetLocked(false);
          break;
        case "toggle_lock_from_tray":
          if (windowLabelRef.current === "main") wH.handleToggleWidgetLock();
          break;
        case "pomodoro_sync":
          try {
            const data = JSON.parse(p.title);
            pH.setPomodoroIsActive(data.active);
            pH.setPomodoroTimeLeft(data.timeLeft);
            pH.setPomodoroIsBreak(data.isBreak);
            pH.setFocusDuration(data.focusDuration);
            pH.setBreakDuration(data.breakDuration);
            pH.setPomodoroSessionCount(data.sessionCount);
            pH.setPomodoroTaskId(data.taskId || null);
            pH.setPomodoroTaskTitle(data.taskTitle || null);
            pH.setPomodoroEndTime(data.endTime);
          } catch (e) {}
          break;
        case "add_pomodoro_log":
          try {
            const log = JSON.parse(p.title);
            pH.setPomodoroLogs((prev: any[]) => [log, ...prev.filter((l: any) => l.id !== log.id)]);
          } catch (e) {}
          break;
        case "add_note":
          try {
            const note = JSON.parse(p.title);
            nH.setStickyNotes((prev: any[]) => [note, ...prev.filter((n: any) => n.id !== note.id)]);
          } catch (e) {}
          break;
        case "edit_note_text":
          nH.setStickyNotes((prev: any[]) => prev.map((n) => n.id === p.task_id ? { ...n, text: p.title } : n));
          break;
        case "change_note_color":
          nH.setStickyNotes((prev: any[]) => prev.map((n) => n.id === p.task_id ? { ...n, color: p.title } : n));
          break;
        case "delete_note":
          nH.setStickyNotes((prev: any[]) => prev.filter((n) => n.id !== p.task_id));
          break;
        case "settings_sync":
          try {
            const config = JSON.parse(p.title);
            cH.setCustomizationConfig(config);
          } catch (e) {}
          break;
        case "restore_sync":
          try {
            const restored = JSON.parse(p.title);
            const tasks = restored.tasks || [];
            const completed = restored.completedTasks || [];
            const notes = restored.stickyNotes || [];
            tH.setTasks(tasks);
            tH.saveTasks(tasks);
            tH.setCompletedTasks(completed);
            tH.saveCompleted(completed);
            nH.setStickyNotes(notes);
            setJournal(restored.journal || []);
            localStorage.setItem("tongyun_journal", JSON.stringify(restored.journal || []));
            cH.setCustomizationConfig(restored.customizationConfig || cH.DEFAULT_CUSTOMIZATION_CONFIG);
          } catch (e) {}
          break;
      }
    };

    const unlistenPromise = listen("todo-sync-event", (event: any) => handleSyncPayload(event.payload)).catch(() => undefined);
    const unsubDev = subscribeDevSync((event) => handleSyncPayload(event.payload));

    return () => {
      unlistenPromise.then((unlisten) => { if (typeof unlisten === "function") unlisten(); }).catch(() => {});
      unsubDev();
    };
  }, []);

  // ============ State Persistence (#2) ============
  // 之前有 6 个「状态一变就写 localStorage」的 effect，与 useTasks 内部持久化重叠，
  // 且 moodAttachments 可能含 base64 图片，每次变更全量 JSON.stringify + 写磁盘会卡顿。
  // 现在统一改为 debounce 写入：isHydrated 后才启用，250ms 合并多次变更为一次落盘。
  useDebouncedPersistence(notesHook.stickyNotes, "aero_sticky_notes", 250, isHydrated);
  useDebouncedPersistence(customizationHook.customizationConfig, "aero_customization_config", 250, isHydrated);
  useDebouncedPersistence(pomodoroHook.pomodoroLogs, "aero_pomodoro_logs", 250, isHydrated);
  useDebouncedPersistence(countdownHook.countdowns, "tongyun_countdowns", 250, isHydrated);

  // ============ Pomodoro Timer Effect (stable interval, ref-based state machine) ============
  // 用 ref 转发"随时可能变"的字段。effect 依赖只保留 active + endTime，避免每次
  // session/duration/taskId 变化都 clear+rebuild interval 引起秒表跳变或重复触发完成分支。
  const pomodoroStateRef = useRef({
    isBreak: pomodoroHook.pomodoroIsBreak,
    focusDuration: pomodoroHook.focusDuration,
    breakDuration: pomodoroHook.breakDuration,
    sessionCount: pomodoroHook.pomodoroSessionCount,
    taskId: pomodoroHook.pomodoroTaskId,
    taskTitle: pomodoroHook.pomodoroTaskTitle,
    locale,
    windowLabel,
    syncPomodoro: pomodoroHook.syncPomodoro,
    focusTime: t.notification.focusTime,
    focusTimeBody: t.notification.focusTimeBody,
    pomodoroTime: t.notification.pomodoroTime,
    pomodoroTimeBody: t.notification.pomodoroTimeBody,
    randomBreakEnabled: pomodoroHook.randomBreakEnabled,
    isPlayingNoise: pomodoroHook.isPlayingNoise,
    autoNoiseEnabled: pomodoroHook.autoNoiseEnabled,
    selectedNoiseType: pomodoroHook.selectedNoiseType,
    noiseVolume: pomodoroHook.noiseVolume,
  });
  useEffect(() => {
    pomodoroStateRef.current = {
      isBreak: pomodoroHook.pomodoroIsBreak,
      focusDuration: pomodoroHook.focusDuration,
      breakDuration: pomodoroHook.breakDuration,
      sessionCount: pomodoroHook.pomodoroSessionCount,
      taskId: pomodoroHook.pomodoroTaskId,
      taskTitle: pomodoroHook.pomodoroTaskTitle,
      locale,
      windowLabel,
      syncPomodoro: pomodoroHook.syncPomodoro,
      focusTime: t.notification.focusTime,
      focusTimeBody: t.notification.focusTimeBody,
      pomodoroTime: t.notification.pomodoroTime,
      pomodoroTimeBody: t.notification.pomodoroTimeBody,
      randomBreakEnabled: pomodoroHook.randomBreakEnabled,
      isPlayingNoise: pomodoroHook.isPlayingNoise,
      autoNoiseEnabled: pomodoroHook.autoNoiseEnabled,
      selectedNoiseType: pomodoroHook.selectedNoiseType,
      noiseVolume: pomodoroHook.noiseVolume,
    };
  });

  const nextRandomBreakRef = useRef<number | null>(null);
  const isOnRandomBreakRef = useRef<boolean>(false);

  useEffect(() => {
    if (!pomodoroHook.pomodoroIsActive || !pomodoroHook.pomodoroEndTime) return;
    const endTime = pomodoroHook.pomodoroEndTime;
    let fired = false;

    // Initialize first random break when focus session starts
    if (pomodoroHook.randomBreakEnabled && !pomodoroHook.pomodoroIsBreak && nextRandomBreakRef.current === null) {
      const minGap = 180;
      const maxGap = 420;
      const totalSec = pomodoroHook.focusDuration * 60;
      nextRandomBreakRef.current = totalSec - (minGap + Math.random() * (maxGap - minGap));
    }

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.round((endTime - now) / 1000));
      pomodoroHook.setPomodoroTimeLeft(diff);

      const ps = pomodoroStateRef.current;

      // Random micro-break check
      if (
        ps.randomBreakEnabled &&
        !ps.isBreak &&
        diff > 0 &&
        nextRandomBreakRef.current !== null &&
        diff <= nextRandomBreakRef.current &&
        !isOnRandomBreakRef.current
      ) {
        isOnRandomBreakRef.current = true;
        clearInterval(intervalId);
        const sounds = ["beep", "cuckoo", "meow", "chime", "ding", "marimba"];
        const randomSound = sounds[Math.floor(Math.random() * sounds.length)];
        audioEngine.playCompletionSound(randomSound);
        const wasPlayingNoise = ps.isPlayingNoise;
        if (wasPlayingNoise) {
          pomodoroHook.stopNoise();
        }
        const minGap = 180;
        const maxGap = 420;
        const nextGap = minGap + Math.random() * (maxGap - minGap);
        nextRandomBreakRef.current = diff - nextGap;
        if (nextRandomBreakRef.current < 30) {
          nextRandomBreakRef.current = -1;
        }
        setTimeout(() => {
          isOnRandomBreakRef.current = false;
          const psNow = pomodoroStateRef.current;
          if (wasPlayingNoise || psNow.autoNoiseEnabled) {
            pomodoroHook.startNoise(psNow.selectedNoiseType, psNow.noiseVolume);
          }
          pomodoroHook.setPomodoroEndTime(endTime + 5000);
        }, 5000);
      }

      if (diff <= 0 && !fired) {
        fired = true;
        clearInterval(intervalId);
        nextRandomBreakRef.current = null;
        isOnRandomBreakRef.current = false;

        const s = pomodoroStateRef.current;
        if (s.windowLabel !== "main") return;

        pomodoroHook.playCompletionSound();
        // Auto-noise only: stop when session ends (manual noise keeps playing)
        if (pomodoroHook.autoNoiseEnabled) {
          pomodoroHook.stopNoise();
        }

        if (s.isBreak) {
          pomodoroHook.setPomodoroIsBreak(false);
          pomodoroHook.setPomodoroIsActive(false);
          pomodoroHook.setPomodoroEndTime(null);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(s.focusTime, { body: s.focusTimeBody });
          }
          const nextTime = s.focusDuration * 60;
          pomodoroHook.setPomodoroTimeLeft(nextTime);
          setTimeout(() => {
            s.syncPomodoro(false, nextTime, false, s.focusDuration, s.breakDuration, s.sessionCount, null, null);
          }, 50);
        } else {
          pomodoroHook.setPomodoroIsBreak(true);
          pomodoroHook.setPomodoroIsActive(false);
          pomodoroHook.setPomodoroEndTime(null);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(s.pomodoroTime, { body: s.pomodoroTimeBody });
          }
          const nextSession = s.sessionCount + 1;
          pomodoroHook.setPomodoroSessionCount(nextSession);
          const nextTime = s.breakDuration * 60;
          pomodoroHook.setPomodoroTimeLeft(nextTime);

          const newLog = {
            id: createId("pomodoro-log"),
            timestamp: Date.now(),
            duration: s.focusDuration,
            taskId: s.taskId || undefined,
            taskTitle: s.taskTitle || undefined,
          };
          pomodoroHook.setPomodoroLogs((prev: any[]) => [newLog, ...prev]);

          setCelebrationMessage(s.locale === "en" ? "Focus session done! Keep going 💪" : "专注一关完成！继续加油 💪");

          pomodoroHook.setPomodoroTaskId(null);
          pomodoroHook.setPomodoroTaskTitle(null);

          setTimeout(() => {
            s.syncPomodoro(false, nextTime, true, s.focusDuration, s.breakDuration, nextSession, null, null);
          }, 50);
        }
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoroHook.pomodoroIsActive, pomodoroHook.pomodoroEndTime]);

  // Audio cleanup
  useEffect(() => {
    return () => { audioEngine.close(); };
  }, []);

  // ============ 任务到期系统通知（智能规划 C 补全）============
  // 每分钟扫描：今日到期、有具体时间、未完成的任务；
  // 到期前 N 分钟（设置可配，默认 15）与到期时刻各提醒一次。
  // 仅 main 窗口触发；key 分 before/due 防止两阶段互相吞掉。
  // 点击通知 → 聚焦主窗 + 打开任务详情。
  const notifiedDueRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isHydrated) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (windowLabelRef.current !== "main") return;

    const openTaskFromNotification = (taskId: string) => {
      try {
        getCurrentWebviewWindow().setFocus().catch(() => {});
      } catch { /* browser / non-tauri */ }
      setActiveTab("home");
      setFlowMode(false);
      tasksHook.setDetailTaskId(taskId);
    };

    const check = () => {
      const enabledRaw = localStorage.getItem("tongyun_due_remind_enabled");
      if (enabledRaw === "0") return;
      const beforeMinRaw = parseInt(localStorage.getItem("tongyun_due_remind_before_min") || "15", 10);
      const beforeMin = [5, 15, 30, 60].includes(beforeMinRaw) ? beforeMinRaw : 15;
      const REMIND_BEFORE = beforeMin * 60 * 1000;

      const now = new Date();
      const todayStr = getLocalDateString(now);
      const nowTs = now.getTime();
      const isZh = locale === "zh-CN";
      for (const task of tasksHook.tasks) {
        if (task.dueDate !== todayStr || !task.dueTime) continue;
        if (tasksHook.completedTasks.some((c) => c.id === task.id)) continue;
        const [h, m] = task.dueTime.split(":").map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        const dueTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).getTime();
        let phase: "before" | "due" | null = null;
        let body = "";
        if (nowTs >= dueTs && nowTs <= dueTs + 60 * 60 * 1000) {
          phase = "due";
          body = isZh ? `已到截止时间 ${task.dueTime}` : `Due at ${task.dueTime}`;
        } else if (nowTs >= dueTs - REMIND_BEFORE && nowTs < dueTs) {
          phase = "before";
          const mins = Math.max(1, Math.round((dueTs - nowTs) / 60000));
          body = isZh
            ? (mins <= 1 ? `即将在 ${task.dueTime} 截止` : `还有 ${mins} 分钟（${task.dueTime}）截止`)
            : (mins <= 1 ? `Due at ${task.dueTime}` : `${mins} min left (due ${task.dueTime})`);
        }
        if (!phase) continue;
        const key = `${task.id}:${phase}`;
        if (notifiedDueRef.current.has(key)) continue;
        notifiedDueRef.current.add(key);
        try {
          const n = new Notification(isZh ? "⏰ 任务提醒" : "⏰ Task Reminder", {
            body: `${task.title}\n${body}`,
            tag: `tongyun-due-${task.id}-${phase}`,
            data: { taskId: task.id },
          });
          n.onclick = () => {
            openTaskFromNotification(task.id);
            try { n.close(); } catch { /* ignore */ }
          };
        } catch { /* ignore */ }
      }
    };
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [isHydrated, locale, tasksHook.tasks, tasksHook.completedTasks, tasksHook.setDetailTaskId]);

  // ============ AI Confirm Tasks ============
  const handleConfirmAiTasks = useCallback(() => {
    if (aiHook.aiPreviewTasks.length === 0) return;
    aiHook.aiPreviewTasks.forEach((item) => {
      tasksHook.handleAddTask({
        title: item.title,
        description: item.description || "",
        notes: item.notes || "",
        category: item.category,
        dueDate: item.dueDate || getLocalDateString(),
        dueTime: item.dueTime || undefined,
        isExplicit: true,
      });
    });
    const count = aiHook.aiPreviewTasks.length;
    aiHook.setAiPreviewTasks([]);
    aiHook.setAiInputText("");
    aiHook.setAiInputMessage({
      type: "success",
      text: `🎉 AI 成功规划并录入 ${count} 项日程待办！`,
    });
  }, [aiHook.aiPreviewTasks, tasksHook.handleAddTask]);

  // ============ Celebration on Complete ============
  const originalHandleComplete = tasksHook.handleComplete;
  const wrappedHandleComplete = useCallback((id: string) => {
    originalHandleComplete(id);
    if (customizationHook.customizationConfig.enableCelebration !== false) {
      const fixedPool = locale === "en"
        ? ["You're amazing! 🎉", "Nailed it! 💪", "Perfect! ✨", "On fire! 🚀", "Task destroyer! 🏆", "Unstoppable! 😎", "What a day! ☀️", "Have a cookie! 🍪", "Brilliant! 🔥", "Flawless! ⭐"]
        : ["你真牛逼！🎉", "太强了吧！💪", "完美收官！✨", "效率爆表！🚀", "任务终结者！🏆", "无敌是多么寂寞！😎", "今天也是元气满满的一天！☀️", "你值得一朵小红花 🌸", "帅呆了！🔥", "行云流水！⭐"];
      let aiPool: string[] = [];
      try {
        const stored = localStorage.getItem("tongyun_ai_praise");
        if (stored) aiPool = safeJsonParse(stored, []);
      } catch (e) {}
      const pool = [...fixedPool, ...aiPool];
      setCelebrationMessage(pool[Math.floor(Math.random() * pool.length)]);
    }
  }, [originalHandleComplete, customizationHook.customizationConfig.enableCelebration, locale]);

  // ============ 云端同步（统一走 syncEngine）============
  const applySyncDataToState = useCallback((data: SyncData) => {
    isRestoringRef.current = true;
    const tasks = dedupeActiveTasks(data.tasks, data.completedTasks);
    tasksHook.setTasks(tasks);
    tasksHook.saveTasks(tasks);
    tasksHook.setCompletedTasks(data.completedTasks);
    tasksHook.saveCompleted(data.completedTasks);
    notesHook.setStickyNotes(data.stickyNotes);
    pomodoroHook.setPomodoroLogs(data.pomodoroLogs);
    countdownHook.setCountdowns(data.countdowns);
    setHabits(data.habits);
    setHabitLogs(data.habitLogs);
    setJournal(data.journal || []);
    localStorage.setItem("tongyun_habits", JSON.stringify(data.habits));
    localStorage.setItem("tongyun_habit_logs", JSON.stringify(data.habitLogs));
    localStorage.setItem("tongyun_moods", JSON.stringify(data.moods));
    localStorage.setItem("tongyun_journal", JSON.stringify(data.journal || []));
    if (data.customizationConfig) {
      customizationHook.setCustomizationConfig(data.customizationConfig);
    }
  }, [tasksHook, notesHook, pomodoroHook, countdownHook, customizationHook]);

  // 监听 syncEngine 拉取远程数据后刷新 UI
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<SyncData>).detail;
      applySyncDataToState(data);
    };
    window.addEventListener(SYNC_APPLIED_EVENT, handler);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, handler);
  }, [applySyncDataToState]);

  // syncEngine 状态 → Sidebar 指示器
  useEffect(() => {
    return syncEngine.subscribe((state) => {
      if (state.status === "syncing") setSyncStatus("syncing");
      else if (state.status === "error") setSyncStatus("error");
      else if (state.status === "success") setSyncStatus("synced");
      if (state.lastSyncTime) setLastBackupTime(state.lastSyncTime);
    });
  }, []);

  // ============ 数据变更 → 按分类标记脏 + 递增版本号 ============
  // 之前 markDirty() 无参会把所有分类都标记脏，导致「改一处心情 emoji 也全量上传所有分类文件」。
  // 现在用 diff 比对，只把真正变化的分类标记脏，sync 时只上传变化的文件，减少无谓的全量上传。
  const prevSyncDataRef = useRef<{
    tasks: Task[]; completedTasks: Task[]; stickyNotes: unknown; config: unknown;
    pomodoroLogs: unknown; countdowns: unknown;
  } | null>(null);

  useEffect(() => {
    if (isFirstLoad.current) return;
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      prevSyncDataRef.current = {
        tasks: tasksHook.tasks, completedTasks: tasksHook.completedTasks,
        stickyNotes: notesHook.stickyNotes, config: customizationHook.customizationConfig,
        pomodoroLogs: pomodoroHook.pomodoroLogs, countdowns: countdownHook.countdowns,
      };
      return;
    }

    const prev = prevSyncDataRef.current;
    const changed: SyncCategory[] = [];
    if (!prev || prev.tasks !== tasksHook.tasks) changed.push("tasks");
    if (!prev || prev.completedTasks !== tasksHook.completedTasks) changed.push("completedTasks");
    if (!prev || prev.stickyNotes !== notesHook.stickyNotes) changed.push("stickyNotes");
    if (!prev || prev.config !== customizationHook.customizationConfig) changed.push("config");
    if (!prev || prev.pomodoroLogs !== pomodoroHook.pomodoroLogs) changed.push("pomodoroLogs");
    if (!prev || prev.countdowns !== countdownHook.countdowns) changed.push("countdowns");

    prevSyncDataRef.current = {
      tasks: tasksHook.tasks, completedTasks: tasksHook.completedTasks,
      stickyNotes: notesHook.stickyNotes, config: customizationHook.customizationConfig,
      pomodoroLogs: pomodoroHook.pomodoroLogs, countdowns: countdownHook.countdowns,
    };
    if (changed.length === 0) return;
    bumpSyncVersion();
    for (const c of changed) {
      bumpCategoryVersion(c);
      syncEngine.markDirty(c);
    }
  }, [tasksHook.tasks, tasksHook.completedTasks, notesHook.stickyNotes, customizationHook.customizationConfig, pomodoroHook.pomodoroLogs, countdownHook.countdowns]);

  // 初始化 syncEngine 自动同步开关
  useEffect(() => {
    if (!isHydrated) return;
    const interval = (customizationHook.customizationConfig.syncInterval || 60) * 1000;
    syncEngine.setAutoSync(customizationHook.customizationConfig.enableAutoBackup !== false, interval);
  }, [isHydrated, customizationHook.customizationConfig.enableAutoBackup, customizationHook.customizationConfig.syncInterval]);

  useEffect(() => {
    isFirstLoad.current = false;
  }, []);

  // 启动时与定期从云端拉取
  useEffect(() => {
    if (!isHydrated || customizationHook.customizationConfig.enableAutoBackup === false) return;
    if (!syncEngine.isConfigured()) return;
    const timer = setTimeout(() => syncEngine.sync(), 3000);
    return () => clearTimeout(timer);
  }, [isHydrated, customizationHook.customizationConfig.enableAutoBackup]);

  useEffect(() => {
    if (!isHydrated || customizationHook.customizationConfig.enableAutoBackup === false) return;
    if (!syncEngine.isConfigured()) return;
    const interval = setInterval(() => syncEngine.sync(), 300000);
    return () => clearInterval(interval);
  }, [isHydrated, customizationHook.customizationConfig.enableAutoBackup]);

  // Add task with AI auto-categorize
  const handleAddTaskWithAI = useCallback(async (taskData: {
    title: string;
    description: string;
    notes: string;
    category: Task["category"];
    dueDate: string;
    dueTime?: string;
    isExplicit?: boolean;
    repeat?: any;
    tags?: string[];
    priority?: Task["priority"];
  }) => {
    const { taskId } = await tasksHook.handleAddTask(taskData);

    if (!taskData.isExplicit && customizationHook.customizationConfig.aiAutoCategorize && customizationHook.customizationConfig.aiApiKey) {
      const aiCategory = await aiHook.aiAutoCategorize(taskData.title, taskData.description);
      if (aiCategory && aiCategory !== taskData.category) {
        tasksHook.setTasks((prev: Task[]) => {
          const updated = prev.map((t) => (t.id === taskId ? { ...t, category: aiCategory! } : t));
          tasksHook.saveTasks(updated);
          return updated;
        });
      }
    }
  }, [tasksHook.handleAddTask, tasksHook.setTasks, tasksHook.saveTasks, customizationHook.customizationConfig, aiHook.aiAutoCategorize]);

  // News → action linkage (feature A): turn an article into a task / journal entry
  const handleNewsSaveTask = useCallback((ref: { title: string; url: string }) => {
    handleAddTaskWithAI({
      title: ref.title,
      description: ref.url,
      notes: ref.url,
      category: "important-not-urgent",
      dueDate: getLocalDateString(),
      priority: "low",
      tags: ["资讯"],
    });
  }, [handleAddTaskWithAI]);

  const handleNewsSaveJournal = useCallback((ref: { title: string; url: string; description?: string }) => {
    const entry: JournalEntry = {
      id: createId(),
      linkKey: "news-" + createId(),
      title: ref.title,
      content: (ref.description ? ref.description + "\n\n" : "") + "来源: " + (ref.url || ""),
      date: getLocalDateString(),
      isDaily: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    handleUpsertJournal(entry);
  }, [handleUpsertJournal]);

  const handlePinNoteToDesktop = useCallback(async (id: string) => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = `note-${id}`;
      const noteWindow = new WebviewWindow(label, {
        url: `${window.location.origin}${window.location.pathname}?noteId=${id}`,
        title: `便签贴-${id}`,
        width: 240,
        height: 240,
        resizable: true,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        shadow: false,
      });
      noteWindow.once("tauri://error", () => {
        WebviewWindow.getByLabel(label)?.then((w) => w?.setFocus());
      });
    } catch (err) {
      console.error("创建桌面便签贴失败", err);
    }
  }, []);

  // Watercolor blobs removed — clean background for calm precision design

  // ============ FloatingNote / Widget / Main Render ============
  if (windowLabel.startsWith("note-")) {
    const noteId = windowLabel.substring(5);
    return <FloatingNoteWindow noteId={noteId} />;
  }

  if (windowLabel === "widget") {
    return (
      <React.Suspense fallback={<div className="w-full h-screen bg-[#FAFAF8]" />}>
      <WidgetWindow
        tasks={tasksHook.tasks}
        completedTasks={tasksHook.completedTasks}
        stickyNotes={notesHook.stickyNotes}
        progressPercentage={tasksHook.progressPercentage}
        pomodoroLogs={pomodoroHook.pomodoroLogs}
        isWidgetLocked={widgetHook.isWidgetLocked}
        handleToggleWidgetLock={widgetHook.handleToggleWidgetLock}
        handleComplete={wrappedHandleComplete}
        handleSnooze={tasksHook.handleSnooze}
        handleAddNote={notesHook.handleAddNote}
        handleDeleteNote={notesHook.handleDeleteNote}
        handleEditNoteText={notesHook.handleEditNoteText}
        handleChangeNoteColor={notesHook.handleChangeNoteColor}
        pomodoroIsActive={pomodoroHook.pomodoroIsActive}
        setPomodoroIsActive={pomodoroHook.setPomodoroIsActive}
        pomodoroTimeLeft={pomodoroHook.pomodoroTimeLeft}
        setPomodoroTimeLeft={pomodoroHook.setPomodoroTimeLeft}
        pomodoroIsBreak={pomodoroHook.pomodoroIsBreak}
        pomodoroSessionCount={pomodoroHook.pomodoroSessionCount}
        focusDuration={pomodoroHook.focusDuration}
        setFocusDuration={pomodoroHook.setFocusDuration}
        breakDuration={pomodoroHook.breakDuration}
        setBreakDuration={pomodoroHook.setBreakDuration}
        syncPomodoro={pomodoroHook.syncPomodoro}
        setTasks={tasksHook.setTasks}
        saveTasks={tasksHook.saveTasks}
        syncState={syncState}
        customizationConfig={customizationHook.customizationConfig}
        pomodoroTaskId={pomodoroHook.pomodoroTaskId}
        pomodoroTaskTitle={pomodoroHook.pomodoroTaskTitle}
        setPomodoroTaskId={pomodoroHook.setPomodoroTaskId}
        setPomodoroTaskTitle={pomodoroHook.setPomodoroTaskTitle}
        handleStartFocus={pomodoroHook.handleStartFocus}
        handleToggleFavorite={tasksHook.handleToggleFavorite}
        celebrationMessage={celebrationMessage}
        onClearCelebration={() => setCelebrationMessage(null)}
        handleUndoComplete={tasksHook.handleUndoComplete}
      />
      </React.Suspense>
    );
  }

  return (
    <PomodoroContext.Provider value={pomodoroHook}>
      <MainLayout
    flowMode={flowMode}
    setFlowMode={setFlowMode}
    activeTab={activeTab}
    setActiveTab={setActiveTab}
    t={t}
    fontFamily={customizationHook.customizationConfig.fontFamily || "sans"}
    tasks={tasksHook.tasks}
    completedTasks={tasksHook.completedTasks}
    progressPercentage={tasksHook.progressPercentage}
    wrappedHandleComplete={wrappedHandleComplete}
    handleDeleteTask={tasksHook.handleDeleteTask}
    handleTaskClick={tasksHook.handleTaskClick}
    handleCloseDetail={tasksHook.handleCloseDetail}
    handleToggleSubtask={tasksHook.handleToggleSubtask}
    handleAddSubtask={tasksHook.handleAddSubtask}
    handleSaveNotes={tasksHook.handleSaveNotes}
    handleUpdateTags={tasksHook.handleUpdateTags}
    handleEditTask={tasksHook.handleEditTask}
    handleUndoComplete={tasksHook.handleUndoComplete}
    handleToggleFavorite={tasksHook.handleToggleFavorite}
    handleTogglePin={tasksHook.handleTogglePin}
    handleAddTaskWithAI={handleAddTaskWithAI}
    handleConfirmAiTasks={handleConfirmAiTasks}
    expandedNoteId={tasksHook.expandedNoteId}
    setExpandedNoteId={tasksHook.setExpandedNoteId}
    editingNotes={tasksHook.editingNotes}
    setEditingNotes={tasksHook.setEditingNotes}
    detailTaskId={tasksHook.detailTaskId}
    notesHook={notesHook}
    countdownHook={countdownHook}
    widgetHook={widgetHook}
    aiHook={aiHook}
    customizationHook={customizationHook}
        handlePinNoteToDesktop={handlePinNoteToDesktop}
        celebrationMessage={celebrationMessage}
    setCelebrationMessage={setCelebrationMessage}
    syncStatus={syncStatus}
    lastBackupTime={lastBackupTime}
    commandPaletteOpen={commandPaletteOpen}
    setCommandPaletteOpen={setCommandPaletteOpen}
    windowLabel={windowLabel}
    resetTasks={tasksHook.resetTasks}
    pomodoroHandleStartFocus={pomodoroHook.handleStartFocus}
    pomodoroLogs={pomodoroHook.pomodoroLogs}
    alertSoundType={pomodoroHook.alertSoundType}
    setAlertSoundType={pomodoroHook.setAlertSoundType}
    handleClearCompleted={tasksHook.handleClearCompleted}
    onNewsSaveTask={handleNewsSaveTask}
    onNewsSaveJournal={handleNewsSaveJournal}
      />
    </PomodoroContext.Provider>
  );
}

// Memoized main layout — only re-renders when view-relevant state changes
interface MainLayoutProps {
  flowMode: boolean; setFlowMode: (v: boolean) => void;
  activeTab: AppTab; setActiveTab: (v: AppTab) => void;
  t: ReturnType<typeof useTranslation>["t"];
  fontFamily: string;
  tasks: Task[]; completedTasks: Task[];
  progressPercentage: number;
  wrappedHandleComplete: (id: string) => void;
  handleDeleteTask: (id: string) => void;
  handleTaskClick: (task: Task) => void;
  handleCloseDetail: () => void;
  handleToggleSubtask: (taskId: string, subtaskId: string) => void;
  handleAddSubtask: (taskId: string, title: string) => void;
  handleSaveNotes: (id: string, notes: string) => void;
  handleUpdateTags: (id: string, tags: string[]) => void;
  handleEditTask: (id: string, updates: Partial<Task>) => void;
  handleUndoComplete: (id: string) => void;
  handleToggleFavorite: (id: string) => void;
  handleTogglePin: (id: string) => void;
  handleAddTaskWithAI: (data: any) => void;
  handleConfirmAiTasks: () => void;
  expandedNoteId: string | null;
  setExpandedNoteId: (id: string | null) => void;
  editingNotes: string;
  setEditingNotes: (notes: string) => void;
  detailTaskId: string | null;
  notesHook: ReturnType<typeof useStickyNotes>;
  countdownHook: ReturnType<typeof useCountdown>;
  // 仅传递「跨秒级 tick 稳定」的 pomodoro 派生字段（函数/日志/音效类型），
  // 避免把整个每帧变化的 pomodoroHook 传给 MainLayout 导致其随每秒 tick 重渲染。
  // 实时倒计时由 Sidebar 通过 PomodoroContext 自行消费。
  pomodoroHandleStartFocus: ReturnType<typeof usePomodoro>["handleStartFocus"];
  pomodoroLogs: ReturnType<typeof usePomodoro>["pomodoroLogs"];
  alertSoundType: ReturnType<typeof usePomodoro>["alertSoundType"];
  setAlertSoundType: ReturnType<typeof usePomodoro>["setAlertSoundType"];
  widgetHook: ReturnType<typeof useWidget>;
  aiHook: ReturnType<typeof useAI>;
  customizationHook: ReturnType<typeof useCustomization>;
  handlePinNoteToDesktop: (id: string) => void;
  celebrationMessage: string | null;
  setCelebrationMessage: (msg: string | null) => void;
  syncStatus: "synced" | "syncing" | "error";
  lastBackupTime: number | null;
  commandPaletteOpen: boolean; setCommandPaletteOpen: (v: boolean) => void;
  windowLabel: string;
  resetTasks: () => void;
  handleClearCompleted: () => void;
  onNewsSaveTask: (ref: { title: string; url: string }) => void;
  onNewsSaveJournal: (ref: { title: string; url: string; description?: string }) => void;
}

const MainLayout = React.memo(function MainLayout({
  flowMode, setFlowMode, activeTab, setActiveTab, t, fontFamily,
  tasks, completedTasks, progressPercentage,
  wrappedHandleComplete, handleDeleteTask, handleTaskClick,
  handleCloseDetail, handleToggleSubtask, handleAddSubtask,
  handleSaveNotes, handleUpdateTags, handleEditTask, handleUndoComplete,
  handleToggleFavorite, handleTogglePin, handleAddTaskWithAI, handleConfirmAiTasks,
  expandedNoteId, setExpandedNoteId, editingNotes, setEditingNotes, detailTaskId,
  notesHook, countdownHook, widgetHook, aiHook, customizationHook, pomodoroHandleStartFocus, pomodoroLogs, alertSoundType, setAlertSoundType,
  handlePinNoteToDesktop,
  celebrationMessage, setCelebrationMessage,
  syncStatus, lastBackupTime,
  commandPaletteOpen, setCommandPaletteOpen, windowLabel,
  resetTasks, handleClearCompleted,
  onNewsSaveTask, onNewsSaveJournal,
}: MainLayoutProps) {
  const { habits } = usePersonal();
  return (
    <>
      {flowMode ? (
        <React.Suspense fallback={viewFallback}>
        <FlowMode
          tasks={tasks}
          pomodoroLogs={pomodoroLogs}
          handleComplete={wrappedHandleComplete}
          onExit={() => setFlowMode(false)}
        />
        </React.Suspense>
      ) : (
        <div className={`w-full h-full min-h-screen bg-[#FAFAF8] text-[#2D323A] flex flex-col select-none overflow-hidden relative theme-font-${fontFamily || "sans"}`}>
      <TitleBar />
      <div className="flex flex-grow min-h-0 relative">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          progressPercentage={progressPercentage}
          completedTasksCount={completedTasks.length}
          tasksCount={tasks.length}
          stickyNotesCount={notesHook.stickyNotes.length}
          countdownCount={countdownHook.countdowns.length}
          habitsCount={habits.length}
          handleToggleWidget={widgetHook.handleToggleWidget}
          handleToggleWidgetLock={widgetHook.handleToggleWidgetLock}
          isWidgetLocked={widgetHook.isWidgetLocked}
          resetTasks={resetTasks}
          syncStatus={syncStatus}
          lastBackupTime={lastBackupTime}
          onEnterFlowMode={() => setFlowMode(true)}
        />
        <React.Suspense fallback={viewFallback}>
        {useMemo(() => (
        <main className="flex-grow p-6 overflow-y-auto flex flex-col gap-5 z-10 relative custom-scrollbar min-h-0">
          {activeTab !== "home" && (
            <>
              <header className="flex justify-between items-center border-b border-[#EFEBE4] pb-4">
                <div>
                  <h2 className="text-xl font-bold tracking-wide text-[#2D323A]">
                    {activeTab === "matrix" ? t.header.matrix
                      : activeTab === "list" ? t.header.list
                      : activeTab === "calendar" ? t.header.calendar
                      : activeTab === "notes" ? t.header.notes
                      : activeTab === "analytics" ? t.header.analytics
                      : activeTab === "completed" ? t.header.completed
                      : activeTab === "countdown" ? t.header.countdown
                      : activeTab === "news" ? t.header.news
                      : activeTab === "habits" ? (t.sidebar.habits || "习惯打卡")
                      : activeTab === "gantt" ? "甘特图"
                      : activeTab === "journal" ? (t.journal?.title || "日记手账")
                      : t.header.completed}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    {activeTab === "settings"
                      ? "自定义主题色调、材质滤镜与系统字体，个性化配置您的待办看板。"
                      : activeTab === "news"
                      ? "阅读纸质风骨的每日热点，或订阅您喜爱的 RSS 资讯源。"
                      : "规划今日待办，有条不紊地记录生活的每个瞬间。"}
                  </p>
                </div>
                {(activeTab === "matrix" || activeTab === "list") && (
                  <button
                    onClick={() => aiHook.setShowAiInbox(!aiHook.showAiInbox)}
                    className={`text-xs px-3.5 py-2 rounded-xl font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-xs select-none ${
                      aiHook.showAiInbox ? "bg-[#FCF2F0] text-[#A34E36] border-[#F5DFDB]" : "bg-white text-slate-500 border-[#EFEBE4] hover:bg-[#FAF8F5]"
                    }`}
                    title={aiHook.showAiInbox ? t.quickAdd.closeAi : t.quickAdd.aiInbox}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{aiHook.showAiInbox ? t.quickAdd.closeAi : t.quickAdd.aiInbox}</span>
                  </button>
                )}
              </header>
              
            </>
          )}

          {aiHook.showAiInbox && (activeTab === "matrix" || activeTab === "list") && (
            <div className="bg-white/85 border border-[#EFEBE4] p-4 rounded-2xl shadow-sm z-10 relative flex flex-col gap-2.5 transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#8B6E3C] tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#8B6E3C]" />
                  <span>{t.quickAdd.aiInboxTitle}</span>
                </span>
              </div>
              {aiHook.aiInputMessage && (
                <div className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 animate-fade-in-up ${aiHook.aiInputMessage.type === "success" ? "bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9]" : "bg-[#FFF3E0] text-[#E65100] border border-[#FFE0B2]"}`}>
                  <span>{aiHook.aiInputMessage.text === "API_KEY_MISSING" ? t.quickAdd.apiKeyMissing : aiHook.aiInputMessage.text}</span>
                  {aiHook.aiInputMessage.text === "API_KEY_MISSING" && (
                    <button onClick={() => { setActiveTab("settings"); aiHook.setShowAiInbox(false); aiHook.setAiInputMessage(null); }} className="flex-shrink-0 px-3 py-1 rounded-lg bg-[#E65100] text-white text-[10px] font-bold hover:bg-[#BF360C] transition-colors cursor-pointer">
                      {t.quickAdd.goToSettings}
                    </button>
                  )}
                </div>
              )}
              {aiHook.aiPreviewTasks.length > 0 ? (
                <div className="flex flex-col gap-3 animate-fade-in-up">
                  <div className="text-[10px] font-bold text-slate-500 mb-1 border-b border-[#EFEBE4] pb-1.5">{t.quickAdd.aiPreview}</div>
                  <div className="space-y-3.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {aiHook.aiPreviewTasks.map((item, idx) => (
                      <div key={`ai-${item.title}-${idx}`} className="p-3 bg-[#FAF8F5]/85 border border-[#EFEBE4] rounded-xl flex flex-col gap-2 shadow-2xs">
                        <div className="flex gap-2 items-center">
                          <input type="text" value={item.title} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].title = e.target.value; aiHook.setAiPreviewTasks(u); }} className="flex-grow bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]" placeholder={t.quickAdd.taskTitle} />
                          <input type="date" value={item.dueDate} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].dueDate = e.target.value; aiHook.setAiPreviewTasks(u); }} className="bg-white border border-[#EFEBE4] px-2 py-1 rounded-lg text-[10px] text-slate-700 font-bold focus:outline-none focus:border-[#4D7C5D] w-28 flex-shrink-0" />
                          <input type="time" value={item.dueTime || ""} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].dueTime = e.target.value; aiHook.setAiPreviewTasks(u); }} className="bg-white border border-[#EFEBE4] px-2 py-1 rounded-lg text-[10px] text-slate-700 font-bold focus:outline-none focus:border-[#4D7C5D] w-16 flex-shrink-0" />
                          <select value={item.category} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].category = e.target.value as Task["category"]; aiHook.setAiPreviewTasks(u); }} className="bg-white border border-[#EFEBE4] px-2 py-1 rounded-lg text-[10px] text-slate-700 font-semibold focus:outline-none focus:border-[#4D7C5D] w-32 flex-shrink-0">
                            <option value="urgent-important">I. {t.matrix.urgentImportant}</option>
                            <option value="important-not-urgent">II. {t.matrix.importantNotUrgent}</option>
                            <option value="urgent-not-important">III. {t.matrix.urgentNotImportant}</option>
                            <option value="not-urgent-not-important">IV. {t.matrix.notUrgentNotImportant}</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">任务说明/详情描述</label>
                            <input type="text" value={item.description} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].description = e.target.value; aiHook.setAiPreviewTasks(u); }} className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1 rounded-lg text-[10px] text-slate-600 focus:outline-none focus:border-[#4D7C5D]" placeholder={t.quickAdd.noDescription} />
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">{t.quickAdd.techNotes}</label>
                            <input type="text" value={item.notes} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].notes = e.target.value; aiHook.setAiPreviewTasks(u); }} className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1 rounded-lg text-[10px] text-slate-600 focus:outline-none focus:border-[#4D7C5D]" placeholder={t.quickAdd.noNotes} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end pt-1.5 border-t border-[#EFEBE4]">
                    <button onClick={() => aiHook.setAiPreviewTasks([])} className="text-[10px] text-slate-500 hover:text-slate-700 px-3.5 py-1.5 rounded-lg border border-[#EFEBE4] transition-colors cursor-pointer">{t.quickAdd.discard}</button>
                    <button onClick={handleConfirmAiTasks} className="text-[10px] text-white bg-[#4D7C5D] hover:bg-[#3F684C] px-4.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer shadow-xs">{t.quickAdd.confirmImport}</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <textarea value={aiHook.aiInputText} onChange={(e) => aiHook.setAiInputText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); aiHook.handleAiBatchInput(); } }} onFocus={() => aiHook.aiInputMessage && aiHook.setAiInputMessage(null)} placeholder={t.quickAdd.aiPlaceholder} className="flex-grow bg-[#FAF8F5]/80 border border-[#EFEBE4] px-3.5 py-2 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] transition-colors resize-none h-14 custom-scrollbar font-semibold" disabled={aiHook.aiInputLoading} />
                  <button onClick={aiHook.handleAiBatchInput} disabled={aiHook.aiInputLoading} className={`px-4.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all shadow-[0_2px_4px_rgba(77,124,93,0.1)] select-none ${aiHook.aiInputLoading ? "bg-slate-300 border-slate-300 cursor-not-allowed" : "bg-[#4D7C5D] hover:bg-[#3F684C] border-[#4D7C5D] cursor-pointer hover:scale-105"}`}>
                    {aiHook.aiInputLoading ? (
                      <><Sparkles className="w-3.5 h-3.5 animate-spin" /><span>{t.quickAdd.aiProcessing}</span></>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" /><span>{t.quickAdd.aiAnalyze}</span></>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "home" && (
            <DashboardView
              tasks={tasks}
              completedTasks={completedTasks}
              pomodoroLogs={pomodoroLogs}
              handleComplete={wrappedHandleComplete}
              onTaskClick={handleTaskClick}
              onOpenJournal={() => setActiveTab("journal")}
              config={customizationHook.customizationConfig}
            />
          )}
          {activeTab === "matrix" && (
            <MatrixView tasks={tasks} handleComplete={wrappedHandleComplete} qColors={customizationHook.customizationConfig.qColors} handleStartFocus={pomodoroHandleStartFocus} handleAddTask={handleAddTaskWithAI} handleToggleFavorite={handleToggleFavorite} handleTogglePin={handleTogglePin} onTaskClick={handleTaskClick} searchQuery={aiHook.searchQuery} setSearchQuery={aiHook.setSearchQuery} />
          )}
          {activeTab === "list" && (
            <ListView tasks={tasks} searchQuery={aiHook.searchQuery} setSearchQuery={aiHook.setSearchQuery} categoryFilter={aiHook.categoryFilter} setCategoryFilter={aiHook.setCategoryFilter} tagFilter={aiHook.tagFilter} setTagFilter={aiHook.setTagFilter} handleComplete={wrappedHandleComplete} handleDeleteTask={handleDeleteTask} expandedNoteId={expandedNoteId} setExpandedNoteId={setExpandedNoteId} editingNotes={editingNotes} setEditingNotes={setEditingNotes} handleSaveNotes={handleSaveNotes} handleStartFocus={pomodoroHandleStartFocus} handleAddTask={handleAddTaskWithAI} handleToggleFavorite={handleToggleFavorite} handleTogglePin={handleTogglePin} onTaskClick={handleTaskClick} />
          )}
          {activeTab === "calendar" && (
            <CalendarView tasks={tasks} handleComplete={wrappedHandleComplete} handleAddTask={handleAddTaskWithAI} />
          )}
          {activeTab === "notes" && (
            <StickyNotesView stickyNotes={notesHook.stickyNotes} handleAddNote={notesHook.handleAddNote} handleEditNoteText={notesHook.handleEditNoteText} handleChangeNoteColor={notesHook.handleChangeNoteColor} handleDeleteNote={notesHook.handleDeleteNote} pinType={customizationHook.customizationConfig.pinType} onPinNoteToDesktop={handlePinNoteToDesktop} />
          )}
          {activeTab === "news" && (
            <NewsView
              config={customizationHook.customizationConfig}
              onSaveTask={onNewsSaveTask}
              onSaveJournal={onNewsSaveJournal}
            />
          )}
          {activeTab === "analytics" && (
            <AnalyticsView pomodoroLogs={pomodoroLogs} tasks={tasks} completedTasks={completedTasks} />
          )}
          {activeTab === "completed" && (
            <CompletedView completedTasks={completedTasks} handleClearCompleted={handleClearCompleted} handleUndoComplete={handleUndoComplete} handleDeleteTask={handleDeleteTask} />
          )}
          {activeTab === "countdown" && (
            <CountdownView countdowns={countdownHook.countdowns} handleAddCountdown={countdownHook.handleAddCountdown} handleDeleteCountdown={countdownHook.handleDeleteCountdown} />
          )}
          {activeTab === "habits" && (
            <HabitsView />
          )}
          {activeTab === "gantt" && (
            <GanttView tasks={tasks} onTaskClick={handleTaskClick} />
          )}
          {activeTab === "journal" && (
            <JournalView
              tasks={tasks}
              completedTasks={completedTasks}
              pomodoroLogs={pomodoroLogs}
              aiConfig={customizationHook.customizationConfig}
            />
          )}
          {activeTab === "settings" && (
            <SettingsView config={customizationHook.customizationConfig} onChange={customizationHook.handleConfigChange} alertSoundType={alertSoundType} setAlertSoundType={setAlertSoundType} resetTasks={resetTasks} />
          )}
        </main>
        ), [
          activeTab, tasks, completedTasks,
          t, fontFamily,
          wrappedHandleComplete, handleDeleteTask, handleTaskClick,
          handleCloseDetail, handleToggleSubtask, handleAddSubtask,
          handleSaveNotes, handleUpdateTags, handleEditTask, handleUndoComplete,
          handleToggleFavorite, handleTogglePin,
          handleAddTaskWithAI, handleConfirmAiTasks,
          expandedNoteId, setExpandedNoteId, editingNotes, setEditingNotes,
          detailTaskId,
          aiHook.showAiInbox, aiHook.setShowAiInbox,
          aiHook.aiInputMessage, aiHook.setAiInputMessage,
          aiHook.aiPreviewTasks, aiHook.setAiPreviewTasks,
          aiHook.aiInputText, aiHook.setAiInputText,
          aiHook.aiInputLoading, aiHook.handleAiBatchInput,
          aiHook.searchQuery, aiHook.setSearchQuery,
          aiHook.categoryFilter, aiHook.setCategoryFilter,
          aiHook.tagFilter, aiHook.setTagFilter,
          pomodoroHandleStartFocus, pomodoroLogs,
          alertSoundType, setAlertSoundType,
          customizationHook.customizationConfig, customizationHook.handleConfigChange,
          notesHook.stickyNotes, notesHook.handleAddNote,
          notesHook.handleEditNoteText, notesHook.handleChangeNoteColor, notesHook.handleDeleteNote,
          countdownHook.countdowns, countdownHook.handleAddCountdown, countdownHook.handleDeleteCountdown,
          handlePinNoteToDesktop,
          resetTasks, handleClearCompleted,
        ])}
        </React.Suspense>

        {celebrationMessage && (
          <CelebrationOverlay message={celebrationMessage} onDone={() => setCelebrationMessage(null)} />
        )}
        {detailTaskId && (() => {
          const activeTask = tasks.find((t: Task) => t.id === detailTaskId);
          const completedTask = !activeTask ? completedTasks.find((t: Task) => t.id === detailTaskId) : undefined;
          const task = activeTask || completedTask;
          if (!task) return null;
          return (
            <TaskDetailModal key={task.id} task={task} onClose={handleCloseDetail} onToggleSubtask={handleToggleSubtask} onAddSubtask={handleAddSubtask} onSaveNotes={handleSaveNotes} onUpdateTags={handleUpdateTags} onEditTask={handleEditTask} allTasks={tasks} />
          );
        })()}
      </div>
    </div>
    )}
    {windowLabel === "main" && (
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        tasks={tasks}
        stickyNotes={notesHook.stickyNotes}
        onTaskClick={(task) => { handleTaskClick(task); setCommandPaletteOpen(false); }}
        onNavigate={(tab) => { setActiveTab(tab); setFlowMode(false); }}
        onCreateTask={() => {}}
        onStartFocus={pomodoroHandleStartFocus}
        onToggleWidget={widgetHook.handleToggleWidget}
        onToggleWidgetLock={() => widgetHook.handleToggleWidgetLock()}
        onEnterFlowMode={() => setFlowMode(true)}
      />
    )}
  </>
  );
});

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("AppErrorBoundary caught:", error.message, error.stack);
    console.error("Component stack:", info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen bg-[#FAFAF8] flex items-center justify-center select-none">
          <div className="text-center space-y-4 max-w-md px-6">
            <span className="text-5xl block">🌿</span>
            <h2 className="text-xl font-bold text-slate-500">出了点问题，请刷新页面</h2>
            <p className="text-xs text-slate-400 font-mono bg-slate-100 rounded-lg p-3 text-left break-words max-h-32 overflow-y-auto">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="px-6 py-2.5 rounded-xl bg-[#4D7C5D] text-white text-sm font-bold hover:bg-[#3F684C] transition-all cursor-pointer"
            >
              刷新
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const savedLocale = localStorage.getItem("tongyun_locale") as "zh-CN" | "en" | null;
  return (
    <LanguageProvider initialLocale={savedLocale || "zh-CN"}>
        <AppErrorBoundary>
        <AppInner />
      </AppErrorBoundary>
    </LanguageProvider>
  );
}

export default App;

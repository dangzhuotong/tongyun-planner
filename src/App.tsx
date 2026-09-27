import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Task, AppTab } from "./types";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
const DashboardView = React.lazy(() => import("./components/DashboardView").then((m) => ({ default: m.DashboardView })));
const MatrixView = React.lazy(() => import("./components/MatrixView").then((m) => ({ default: m.MatrixView })));
const ListView = React.lazy(() => import("./components/ListView").then((m) => ({ default: m.ListView })));
import { TaskDetailModal } from "./components/TaskDetailModal";
const CalendarView = React.lazy(() => import("./components/CalendarView").then((m) => ({ default: m.CalendarView })));
const StickyNotesView = React.lazy(() => import("./components/StickyNotesView").then((m) => ({ default: m.StickyNotesView })));
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
const GanttView = React.lazy(() => import("./components/GanttView").then((m) => ({ default: m.GanttView })));
const JournalView = React.lazy(() => import("./components/JournalView").then((m) => ({ default: m.JournalView })));
const MemoryView = React.lazy(() => import("./components/MemoryView").then((m) => ({ default: m.MemoryView })));
import type { Update } from "@tauri-apps/plugin-updater";
import { UpdateModal } from "./components/UpdateModal";
import { checkForAppUpdate } from "./utils/updater";

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
import { useHabits } from "./hooks/useHabits";
import { useDebouncedPersistence } from "./hooks/useDebouncedPersistence";
import type { JournalEntry } from "./types";
import { useSync } from "./hooks/useSync";
import { PomodoroContext } from "./context/PomodoroContext";
import { PersonalProvider, usePersonal } from "./context/PersonalContext";
import { createId } from "./utils/id";
import { getLocalDateString } from "./utils/date";
import { safeJsonParse } from "./utils/json";
import { syncEngine } from "./utils/sync/engine";
import { SYNC_APPLIED_EVENT, bumpSyncVersion, bumpCategoryVersion, dedupeActiveTasks, type SyncCategory, type SyncData } from "./utils/sync/types";
import { beginSyncApply, endSyncApply, isSyncApplying } from "./utils/sync/syncApplyGuard";
import { canUseAI } from "./utils/aiEngine";
import { usePomodoroTimer } from "./hooks/usePomodoroTimer";
import { useDueNotifications } from "./hooks/useDueNotifications";
import { useCrossWindowSync } from "./hooks/useCrossWindowSync";
import { useStoreInit } from "./hooks/useStoreInit";

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
  useEffect(() => { tasksRef.current = tasksHook.tasks; }, [tasksHook.tasks]);
  const pomodoroHook = usePomodoro();
  const notesHook = useStickyNotes();
  const countdownHook = useCountdown();
  const customizationHook = useCustomization();
  const widgetHook = useWidget();
  const habitsHook = useHabits();
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
  const [deleteUndoToast, setDeleteUndoToast] = useState<string | null>(null);
  const deleteUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { journal, journalAddTodo, handleUpsertJournal, setJournal } = usePersonal();

  // 全局开关：是否把每一天的日记加入当日待办 → 同步生成/移除关联任务
  const journalTodoTitle = useCallback((entry: JournalEntry) => {
    return `日记 ${entry.date}`;
  }, []);

  const previousJournalTodoStateRef = useRef<Map<string, string>>(new Map());
  const previousJournalTodoToggleRef = useRef<boolean | null>(null);

  useEffect(() => {
    const currentTasks = tasksRef.current;
    const currentByJournalId = new Map(
      currentTasks.filter((task) => task.journalId).map((task) => [task.journalId!, task])
    );
    const previous = previousJournalTodoStateRef.current;
    const toggleChanged = previousJournalTodoToggleRef.current !== journalAddTodo;
    const nextState = new Map<string, string>();
    const changedEntries: JournalEntry[] = [];

    for (const entry of journal) {
      const signature = `${entry.updatedAt || 0}:${entry.date}:${entry.content.slice(0, 200)}`;
      nextState.set(entry.id, signature);
      if (toggleChanged || previous.get(entry.id) !== signature) changedEntries.push(entry);
    }
    previousJournalTodoStateRef.current = nextState;
    previousJournalTodoToggleRef.current = journalAddTodo;

    for (const entry of changedEntries) {
      if (!entry.isDaily) continue;
      const existing = currentByJournalId.get(entry.id);
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
  const windowLabelRef = useRef("main");
  useStoreInit(handlersRef, setWindowLabel, windowLabelRef, setIsHydrated);

  // ============ 跨窗口 event listener ============
  useCrossWindowSync(handlersRef, windowLabelRef, setJournal);

  // ============ State Persistence (#2) ============
  // 统一改为 debounce 写入：isHydrated 后才启用，250ms 合并多次变更为一次落盘。
  useDebouncedPersistence(notesHook.stickyNotes, "aero_sticky_notes", 250, isHydrated);
  useDebouncedPersistence(customizationHook.customizationConfig, "aero_customization_config", 250, isHydrated);
  useDebouncedPersistence(pomodoroHook.pomodoroLogs, "aero_pomodoro_logs", 250, isHydrated);
  useDebouncedPersistence(countdownHook.countdowns, "tongyun_countdowns", 250, isHydrated);

  // ============ Pomodoro Timer Effect ============
  usePomodoroTimer({
    pomodoroHook,
    locale,
    windowLabel,
    t,
    onCelebration: setCelebrationMessage,
  });

  // Audio cleanup
  useEffect(() => {
    return () => { audioEngine.close(); };
  }, []);

  // ============ 任务到期系统通知 ============
  useDueNotifications({
    isHydrated,
    locale,
    tasks: tasksHook.tasks,
    completedTasks: tasksHook.completedTasks,
    onOpenTask: (taskId) => {
      try {
        getCurrentWebviewWindow().setFocus().catch(() => {});
      } catch { /* browser / non-tauri */ }
      setActiveTab("home");
      setFlowMode(false);
      tasksHook.setDetailTaskId(taskId);
    },
  });

  // ============ 自动更新状态与启动静默检查 ============
  const [activeUpdate, setActiveUpdate] = useState<Update | null>(null);

  useEffect(() => {
    const handleShowUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<Update>;
      if (customEvent.detail) {
        setActiveUpdate(customEvent.detail);
      }
    };
    window.addEventListener("tongyun-show-update", handleShowUpdate);
    return () => window.removeEventListener("tongyun-show-update", handleShowUpdate);
  }, []);

  useEffect(() => {
    if (windowLabelRef.current !== "main") return;
    const timer = setTimeout(async () => {
      try {
        const update = await checkForAppUpdate();
        if (update && update.available) {
          setActiveUpdate(update);
        }
      } catch (err) {
        console.warn("[App] Silent update check skipped/failed:", err);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

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
      } catch (_) { /* ignore parse error */ }
      const pool = [...fixedPool, ...aiPool];
      setCelebrationMessage(pool[Math.floor(Math.random() * pool.length)]);
    }
  }, [originalHandleComplete, customizationHook.customizationConfig.enableCelebration, locale]);

  const wrappedHandleDeleteTask = useCallback((id: string) => {
    const victim =
      tasksHook.tasks.find((t) => t.id === id) ||
      tasksHook.completedTasks.find((t) => t.id === id);
    tasksHook.handleDeleteTask(id);
    if (!victim) return;
    if (deleteUndoTimerRef.current) clearTimeout(deleteUndoTimerRef.current);
    setDeleteUndoToast(victim.title);
    deleteUndoTimerRef.current = setTimeout(() => {
      setDeleteUndoToast(null);
      deleteUndoTimerRef.current = null;
    }, 5000);
  }, [tasksHook.tasks, tasksHook.completedTasks, tasksHook.handleDeleteTask]);

  const handleUndoDeleteClick = useCallback(() => {
    if (deleteUndoTimerRef.current) {
      clearTimeout(deleteUndoTimerRef.current);
      deleteUndoTimerRef.current = null;
    }
    tasksHook.handleUndoDelete();
    setDeleteUndoToast(null);
  }, [tasksHook.handleUndoDelete]);

  // ============ 云端同步（统一走 syncEngine）============
  const applySyncDataToState = useCallback((data: SyncData) => {
    beginSyncApply();
    isRestoringRef.current = true;
    try {
      const tasks = dedupeActiveTasks(data.tasks, data.completedTasks);
      tasksHook.setTasks(tasks);
      tasksHook.saveTasks(tasks);
      tasksHook.setCompletedTasks(data.completedTasks);
      tasksHook.saveCompleted(data.completedTasks);
      notesHook.setStickyNotes(data.stickyNotes);
      pomodoroHook.setPomodoroLogs(data.pomodoroLogs);
      countdownHook.setCountdowns(data.countdowns);
      setJournal(data.journal || []);
      localStorage.setItem("tongyun_journal", JSON.stringify(data.journal || []));
      if (data.customizationConfig) {
        customizationHook.setCustomizationConfig(data.customizationConfig);
      }
    } finally {
      endSyncApply();
    }
  }, [tasksHook, notesHook, pomodoroHook, countdownHook, customizationHook, setJournal]);

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
  // 之前 markDirty() 无参会把所有分类都标记脏，导致「改一处也全量上传所有分类文件」。
  // 现在用 diff 比对，只把真正变化的分类标记脏，sync 时只上传变化的文件，减少无谓的全量上传。
  // 云端 apply / isSyncApplying 期间不 bump，避免空本地被标脏后盖掉远端。
  const prevSyncDataRef = useRef<{
    tasks: Task[]; completedTasks: Task[]; stickyNotes: unknown; config: unknown;
    pomodoroLogs: unknown; countdowns: unknown;
  } | null>(null);

  useEffect(() => {
    if (isFirstLoad.current) return;
    if (!isHydrated) return;
    if (isRestoringRef.current || isSyncApplying()) {
      isRestoringRef.current = false;
      prevSyncDataRef.current = {
        tasks: tasksHook.tasks, completedTasks: tasksHook.completedTasks,
        stickyNotes: notesHook.stickyNotes, config: customizationHook.customizationConfig,
        pomodoroLogs: pomodoroHook.pomodoroLogs, countdowns: countdownHook.countdowns,
      };
      return;
    }

    const prev = prevSyncDataRef.current;
    if (!prev) {
      // hydration 后首次运行：只记录基线，不标记脏，防止空/初始数据被推上远端
      prevSyncDataRef.current = {
        tasks: tasksHook.tasks, completedTasks: tasksHook.completedTasks,
        stickyNotes: notesHook.stickyNotes, config: customizationHook.customizationConfig,
        pomodoroLogs: pomodoroHook.pomodoroLogs, countdowns: countdownHook.countdowns,
      };
      return;
    }

    const changed: SyncCategory[] = [];
    if (prev.tasks !== tasksHook.tasks) changed.push("tasks");
    if (prev.completedTasks !== tasksHook.completedTasks) changed.push("completedTasks");
    if (prev.stickyNotes !== notesHook.stickyNotes) changed.push("stickyNotes");
    if (prev.config !== customizationHook.customizationConfig) changed.push("config");
    if (prev.pomodoroLogs !== pomodoroHook.pomodoroLogs) changed.push("pomodoroLogs");
    if (prev.countdowns !== countdownHook.countdowns) changed.push("countdowns");

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
  }, [isHydrated, tasksHook.tasks, tasksHook.completedTasks, notesHook.stickyNotes, customizationHook.customizationConfig, pomodoroHook.pomodoroLogs, countdownHook.countdowns]);

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

    if (!taskData.isExplicit && customizationHook.customizationConfig.aiAutoCategorize && canUseAI(customizationHook.customizationConfig)) {
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
    journal={journal}
    progressPercentage={tasksHook.progressPercentage}
    wrappedHandleComplete={wrappedHandleComplete}
    handleDeleteTask={wrappedHandleDeleteTask}
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
        habitsHook={habitsHook}
        handlePinNoteToDesktop={handlePinNoteToDesktop}
        celebrationMessage={celebrationMessage}
    setCelebrationMessage={setCelebrationMessage}
    deleteUndoToast={deleteUndoToast}
    onUndoDelete={handleUndoDeleteClick}
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
      {activeUpdate && (
        <UpdateModal
          update={activeUpdate}
          onClose={() => {
            activeUpdate.close().catch(() => {});
            setActiveUpdate(null);
          }}
        />
      )}
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
  journal: JournalEntry[];
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
  habitsHook: ReturnType<typeof useHabits>;
  aiHook: ReturnType<typeof useAI>;
  customizationHook: ReturnType<typeof useCustomization>;
  handlePinNoteToDesktop: (id: string) => void;
  celebrationMessage: string | null;
  setCelebrationMessage: (msg: string | null) => void;
  deleteUndoToast: string | null;
  onUndoDelete: () => void;
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
  tasks, completedTasks, journal, progressPercentage,
  wrappedHandleComplete, handleDeleteTask, handleTaskClick,
  handleCloseDetail, handleToggleSubtask, handleAddSubtask,
  handleSaveNotes, handleUpdateTags, handleEditTask, handleUndoComplete,
  handleToggleFavorite, handleTogglePin, handleAddTaskWithAI, handleConfirmAiTasks,
  expandedNoteId, setExpandedNoteId, editingNotes, setEditingNotes, detailTaskId,
  notesHook, countdownHook, widgetHook, habitsHook, aiHook, customizationHook, pomodoroHandleStartFocus, pomodoroLogs, alertSoundType, setAlertSoundType,
  handlePinNoteToDesktop,
  celebrationMessage, setCelebrationMessage,
  deleteUndoToast, onUndoDelete,
  syncStatus, lastBackupTime,
  commandPaletteOpen, setCommandPaletteOpen, windowLabel,
  resetTasks, handleClearCompleted,
  onNewsSaveTask, onNewsSaveJournal,
}: MainLayoutProps) {
  const mainContent = useMemo(() => (
        <main className="flex-grow p-6 overflow-y-auto flex flex-col gap-5 z-10 relative custom-scrollbar min-h-0">
          {activeTab !== "home" && (
            <>
              <header className="flex justify-between items-center border-b border-[#EFEBE4] dark:border-[#33353A] pb-4">
                <div>
                  <h2 className="text-xl font-bold tracking-wide text-[#2D323A] dark:text-slate-100">
                    {activeTab === "matrix" ? t.header.matrix
                      : activeTab === "list" ? t.header.list
                      : activeTab === "calendar" ? t.header.calendar
                      : activeTab === "notes" ? t.header.notes
                      : activeTab === "analytics" ? t.header.analytics
                      : activeTab === "completed" ? t.header.completed
                      : activeTab === "countdown" ? t.header.countdown
                      : activeTab === "news" ? t.header.news
                      : activeTab === "gantt" ? "甘特图"
                      : activeTab === "journal" ? (t.journal?.title || "日记手账")
                      : activeTab === "memory" ? (t.sidebar?.memory || "时光长廊")
                      : t.header.completed}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                    {activeTab === "matrix"
                      ? t.header.matrixDesc
                      : activeTab === "list"
                      ? t.header.listDesc
                      : activeTab === "calendar"
                      ? t.header.calendarDesc
                      : activeTab === "notes"
                      ? t.header.notesDesc
                      : activeTab === "analytics"
                      ? t.header.analyticsDesc
                      : activeTab === "completed"
                      ? t.header.completedDesc
                      : activeTab === "countdown"
                      ? t.header.countdownDesc
                      : activeTab === "settings"
                      ? t.header.settingsDesc
                      : activeTab === "news"
                      ? t.header.newsDesc
                      : activeTab === "memory"
                      ? t.header.memoryDesc
                      : t.header.homeDesc}
                  </p>
                </div>
                {(activeTab === "matrix" || activeTab === "list") && (
                  <button
                    onClick={() => aiHook.setShowAiInbox(!aiHook.showAiInbox)}
                    className={`text-xs px-3.5 py-2 rounded-xl font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-xs select-none ${
                      aiHook.showAiInbox 
                        ? "bg-[#FCF2F0] dark:bg-[#3D2325] text-[#A34E36] dark:text-[#E06D53] border-[#F5DFDB] dark:border-[#422D30]" 
                        : "bg-white dark:bg-[#1C1D21] text-slate-500 dark:text-slate-400 border-[#EFEBE4] dark:border-[#33353A] hover:bg-[#FAF8F5] dark:hover:bg-[#282A30]"
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
            <div className="bg-white/90 dark:bg-[#1C1D21]/95 border border-[#EFEBE4] dark:border-[#33353A] p-4 rounded-2xl shadow-sm dark:shadow-md z-10 relative flex flex-col gap-2.5 transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#8B6E3C] dark:text-[#CBB182] tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#8B6E3C] dark:text-[#CBB182]" />
                  <span>{t.quickAdd.aiInboxTitle}</span>
                </span>
              </div>
              {aiHook.aiInputMessage && (
                <div className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 animate-fade-in-up ${aiHook.aiInputMessage.type === "success" ? "bg-[#E8F5E9] dark:bg-[#1D2B22] text-[#2E7D32] dark:text-[#6FAD84] border border-[#C8E6C9] dark:border-[#2D3A31]" : "bg-[#FFF3E0] dark:bg-[#2D231B] text-[#E65100] dark:text-[#E06D53] border border-[#FFE0B2] dark:border-[#3E2D26]"}`}>
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
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 border-b border-[#EFEBE4] dark:border-[#33353A] pb-1.5">{t.quickAdd.aiPreview}</div>
                  <div className="space-y-3.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {aiHook.aiPreviewTasks.map((item, idx) => (
                      <div key={`ai-${item.title}-${idx}`} className="p-3 bg-[#FAF8F5]/85 dark:bg-[#23252B] border border-[#EFEBE4] dark:border-[#33353A] rounded-xl flex flex-col gap-2 shadow-2xs">
                        <div className="flex gap-2 items-center">
                          <input type="text" value={item.title} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].title = e.target.value; aiHook.setAiPreviewTasks(u); }} className="flex-grow bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#383A42] px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D]" placeholder={t.quickAdd.taskTitle} />
                          <input type="date" value={item.dueDate} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].dueDate = e.target.value; aiHook.setAiPreviewTasks(u); }} className="bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#383A42] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4D7C5D] w-28 flex-shrink-0" />
                          <input type="time" value={item.dueTime || ""} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].dueTime = e.target.value; aiHook.setAiPreviewTasks(u); }} className="bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#383A42] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4D7C5D] w-16 flex-shrink-0" />
                          <select value={item.category} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].category = e.target.value as Task["category"]; aiHook.setAiPreviewTasks(u); }} className="bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#383A42] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-semibold focus:outline-none focus:border-[#4D7C5D] w-32 flex-shrink-0">
                            <option value="urgent-important">I. {t.matrix.urgentImportant}</option>
                            <option value="important-not-urgent">II. {t.matrix.importantNotUrgent}</option>
                            <option value="urgent-not-important">III. {t.matrix.urgentNotImportant}</option>
                            <option value="not-urgent-not-important">IV. {t.matrix.notUrgentNotImportant}</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-0.5">任务说明/详情描述</label>
                            <input type="text" value={item.description} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].description = e.target.value; aiHook.setAiPreviewTasks(u); }} className="w-full bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#383A42] px-2.5 py-1 rounded-lg text-[10px] text-slate-600 dark:text-slate-300 focus:outline-none focus:border-[#4D7C5D]" placeholder={t.quickAdd.noDescription} />
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-0.5">{t.quickAdd.techNotes}</label>
                            <input type="text" value={item.notes} onChange={(e) => { const u = [...aiHook.aiPreviewTasks]; u[idx].notes = e.target.value; aiHook.setAiPreviewTasks(u); }} className="w-full bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#383A42] px-2.5 py-1 rounded-lg text-[10px] text-slate-600 dark:text-slate-300 focus:outline-none focus:border-[#4D7C5D]" placeholder={t.quickAdd.noNotes} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end pt-1.5 border-t border-[#EFEBE4] dark:border-[#33353A]">
                    <button onClick={() => aiHook.setAiPreviewTasks([])} className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3.5 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#1C1D21] transition-colors cursor-pointer">{t.quickAdd.discard}</button>
                    <button onClick={handleConfirmAiTasks} className="text-[10px] text-white bg-[#4D7C5D] dark:bg-[#3F684C] hover:bg-[#3F684C] dark:hover:bg-[#33553C] px-4.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer shadow-xs">{t.quickAdd.confirmImport}</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <textarea value={aiHook.aiInputText} onChange={(e) => aiHook.setAiInputText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); aiHook.handleAiBatchInput(); } }} onFocus={() => aiHook.aiInputMessage && aiHook.setAiInputMessage(null)} placeholder={t.quickAdd.aiPlaceholder} className="flex-grow bg-[#FAF8F5]/80 dark:bg-[#23252B] border border-[#EFEBE4] dark:border-[#383A42] px-3.5 py-2.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] transition-colors resize-none h-16 custom-scrollbar font-semibold" disabled={aiHook.aiInputLoading} />
                  <button onClick={aiHook.handleAiBatchInput} disabled={aiHook.aiInputLoading} className={`px-4.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all shadow-[0_2px_4px_rgba(77,124,93,0.1)] select-none ${aiHook.aiInputLoading ? "bg-slate-300 dark:bg-slate-700 border-slate-300 dark:border-slate-700 cursor-not-allowed" : "bg-[#4D7C5D] dark:bg-[#3F684C] hover:bg-[#3F684C] dark:hover:bg-[#33553C] border-[#4D7C5D] dark:border-[#3F684C] cursor-pointer hover:scale-105"}`}>
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
              habitsHook={habitsHook}
            />
          )}
          {activeTab === "matrix" && (
            <MatrixView tasks={tasks} handleComplete={wrappedHandleComplete} qColors={customizationHook.customizationConfig.qColors} handleStartFocus={pomodoroHandleStartFocus} handleAddTask={handleAddTaskWithAI} handleToggleFavorite={handleToggleFavorite} handleTogglePin={handleTogglePin} onTaskClick={handleTaskClick} onEditTask={handleEditTask} searchQuery={aiHook.searchQuery} setSearchQuery={aiHook.setSearchQuery} />
          )}
          {activeTab === "list" && (
            <ListView tasks={tasks} searchQuery={aiHook.searchQuery} setSearchQuery={aiHook.setSearchQuery} categoryFilter={aiHook.categoryFilter} setCategoryFilter={aiHook.setCategoryFilter} tagFilter={aiHook.tagFilter} setTagFilter={aiHook.setTagFilter} handleComplete={wrappedHandleComplete} handleDeleteTask={handleDeleteTask} expandedNoteId={expandedNoteId} setExpandedNoteId={setExpandedNoteId} editingNotes={editingNotes} setEditingNotes={setEditingNotes} handleSaveNotes={handleSaveNotes} handleStartFocus={pomodoroHandleStartFocus} handleAddTask={handleAddTaskWithAI} handleToggleFavorite={handleToggleFavorite} handleTogglePin={handleTogglePin} onTaskClick={handleTaskClick} />
          )}
          {activeTab === "calendar" && (
            <CalendarView tasks={tasks} handleComplete={wrappedHandleComplete} handleAddTask={handleAddTaskWithAI} />
          )}
          {activeTab === "notes" && (
            <StickyNotesView stickyNotes={notesHook.stickyNotes} handleAddNote={notesHook.handleAddNote} handleEditNoteText={notesHook.handleEditNoteText} handleEditNoteTitle={notesHook.handleEditNoteTitle} handleChangeNoteColor={notesHook.handleChangeNoteColor} handleDeleteNote={notesHook.handleDeleteNote} pinType={customizationHook.customizationConfig.pinType} onPinNoteToDesktop={handlePinNoteToDesktop} />
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
          {activeTab === "gantt" && (
            <GanttView tasks={tasks} onTaskClick={handleTaskClick} onEditTask={handleEditTask} />
          )}
          {activeTab === "journal" && (
            <JournalView
              tasks={tasks}
              completedTasks={completedTasks}
              pomodoroLogs={pomodoroLogs}
              aiConfig={customizationHook.customizationConfig}
              habitsHook={habitsHook}
            />
          )}
          {activeTab === "memory" && (
            <MemoryView
              completedTasks={completedTasks}
              pomodoroLogs={pomodoroLogs}
              journal={journal}
              config={customizationHook.customizationConfig}
              onOpenJournalDate={(_date) => {
                setActiveTab("journal");
              }}
            />
          )}
          {activeTab === "settings" && (
            <SettingsView config={customizationHook.customizationConfig} onChange={customizationHook.handleConfigChange} alertSoundType={alertSoundType} setAlertSoundType={setAlertSoundType} resetTasks={resetTasks} />
          )}
        </main>
  ), [
    activeTab, tasks, completedTasks, journal,
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
    habitsHook.habits,
    handlePinNoteToDesktop,
    resetTasks, handleClearCompleted,
  ]);
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
          handleToggleWidget={widgetHook.handleToggleWidget}
          handleToggleWidgetLock={widgetHook.handleToggleWidgetLock}
          isWidgetLocked={widgetHook.isWidgetLocked}
          resetTasks={resetTasks}
          syncStatus={syncStatus}
          lastBackupTime={lastBackupTime}
          onEnterFlowMode={() => setFlowMode(true)}
        />
        <React.Suspense fallback={viewFallback}>
        {mainContent}

        </React.Suspense>

        {celebrationMessage && (
          <CelebrationOverlay message={celebrationMessage} onDone={() => setCelebrationMessage(null)} />
        )}
        {deleteUndoToast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#2D323A] text-white text-xs font-bold shadow-lg animate-fade-in-up">
            <span className="max-w-[240px] truncate">
              {(t.listView.deletedToast || "已删除「{title}」").replace("{title}", deleteUndoToast)}
            </span>
            <button
              type="button"
              onClick={onUndoDelete}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-[#C4D7B2] cursor-pointer transition-colors"
            >
              {t.common.undoDelete || t.common.undo || "撤销"}
            </button>
          </div>
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
    {windowLabel === "main" && commandPaletteOpen && (
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        tasks={tasks}
        stickyNotes={notesHook.stickyNotes}
        journal={journal}
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

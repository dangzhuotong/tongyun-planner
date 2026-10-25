import React, { useState } from "react";
import {
  Home,
  LayoutGrid,
  ListTodo,
  StickyNote,
  Clock,
  RotateCcw,
  Coffee,
  Unlock,
  Lock,
  Settings,
  Cloud,
  RefreshCw,
  Target,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Timer,
  Volume2,
  Archive,
  Newspaper,
  BookOpen,
  Sunset,
  Zap,
  Command,
} from "lucide-react";
import type { AppTab, AlertSoundType } from "../types";
import { audioEngine } from "../utils/audioEngine";
import { useTranslation } from "../i18n/LanguageContext";
import { usePomodoroContext } from "../context/PomodoroContext";
import { NOISE_DEFINITIONS, getVisibleNoises } from "../constants";
import logo from "../assets/logo.png";

interface SidebarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  progressPercentage: number;
  completedTasksCount: number;
  tasksCount: number;
  stickyNotesCount: number;
  countdownCount: number;
  syncStatus: "synced" | "syncing" | "error";
  lastBackupTime: number | null;

  // 挂件控制与全局重置（番茄钟/白噪音状态改由 PomodoroContext 提供，避免每秒 tick 触发整树重渲染）
  handleToggleWidget: () => Promise<void>;
  handleToggleWidgetLock: (forceState?: boolean) => Promise<void>;
  isWidgetLocked: boolean;
  resetTasks: () => void;
  onEnterFlowMode: () => void;
  onTestMicroBreak?: () => void;
  onOpenSunsetShutdown?: () => void;
  onOpenEnergyTimeBlock?: () => void;
  onOpenQuickCapture?: () => void;
}

// Map old tab values to new grouped structure for active detection
const TASKS_GROUP: AppTab[] = ["matrix", "list", "calendar"];
const FOCUS_GROUP: AppTab[] = ["analytics"];
const ARCHIVE_GROUP: AppTab[] = ["completed", "countdown", "memory"];

export const Sidebar: React.FC<SidebarProps> = React.memo(
  ({
    activeTab,
    setActiveTab,
    progressPercentage,
    completedTasksCount,
    tasksCount,
    stickyNotesCount,
    countdownCount,
    syncStatus,
    lastBackupTime,
    handleToggleWidget,
    handleToggleWidgetLock,
    isWidgetLocked,
    resetTasks,
    onEnterFlowMode,
    onTestMicroBreak,
    onOpenSunsetShutdown,
    onOpenEnergyTimeBlock,
    onOpenQuickCapture,
  }) => {
    const {
      pomodoroIsActive,
      setPomodoroIsActive,
      pomodoroIsBreak,
      pomodoroSessionCount,
      pomodoroTimeLeft,
      setPomodoroTimeLeft,
      setPomodoroEndTime,
      focusDuration,
      setFocusDuration,
      breakDuration,
      setBreakDuration,
      alertSoundType,
      setAlertSoundType,
      randomBreakEnabled,
      setRandomBreakEnabled,
      microBreakInterval,
      setMicroBreakInterval,
      autoNoiseEnabled,
      setAutoNoiseEnabled,
      syncPomodoro,
      pomodoroTaskId,
      pomodoroTaskTitle,
      setPomodoroTaskId,
      setPomodoroTaskTitle,
      isPlayingNoise,
      selectedNoiseType,
      setSelectedNoiseType,
      noiseVolume,
      setNoiseVolume,
      startNoise,
      stopNoise,
      applyAutoNoise,
    } = usePomodoroContext();
    const { t } = useTranslation();
    const s = t.sidebar;
    const [hasWebdavUrl] = useState(() => !!localStorage.getItem("tongyun_webdav_url"));
    const [editingMinutes, setEditingMinutes] = useState<string | null>(null);

    // Sidebar 随番茄钟每秒重渲染，噪音可见列表只读一次 localStorage，避免每秒 JSON.parse
    const [visibleNoiseDefs] = useState(() => {
      const visibleIds = getVisibleNoises();
      return NOISE_DEFINITIONS.filter((def) => visibleIds.includes(def.id)).map((def) => ({
        id: def.id,
        labelKey: def.labelKey,
        titleKey: def.titleKey,
      }));
    });

    // Sidebar collapse state
    const [isCollapsed, setIsCollapsed] = useState(() => {
      return localStorage.getItem("tongyun_sidebar_collapsed") === "true";
    });

    const toggleCollapsed = () => {
      const next = !isCollapsed;
      setIsCollapsed(next);
      localStorage.setItem("tongyun_sidebar_collapsed", String(next));
    };

    // Text transition class to prevent deformation during collapse/expand
    const textClass = `transition-all duration-200 ${
      isCollapsed ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 delay-150"
    }`;

    // Sub-navigation expansion states
    const [tasksExpanded, setTasksExpanded] = useState(() => TASKS_GROUP.includes(activeTab));
    const [focusExpanded, setFocusExpanded] = useState(() => FOCUS_GROUP.includes(activeTab));
    const [archiveExpanded, setArchiveExpanded] = useState(() => ARCHIVE_GROUP.includes(activeTab));
    const [noiseControlsExpanded, setNoiseControlsExpanded] = useState(false);

    const commitMinutes = (raw: string) => {
      const val = parseInt(raw, 10);
      if (isNaN(val) || val < 1) return;
      const clamped = Math.min(val, 120);
      const newTime = clamped * 60;
      setPomodoroTimeLeft(newTime);
      setEditingMinutes(null);
      if (pomodoroIsBreak) {
        setBreakDuration(clamped);
        localStorage.setItem("pomodoro_break_duration", String(clamped));
        syncPomodoro(false, newTime, true, focusDuration, clamped, pomodoroSessionCount);
      } else {
        setFocusDuration(clamped);
        localStorage.setItem("pomodoro_focus_duration", String(clamped));
        syncPomodoro(false, newTime, false, clamped, breakDuration, pomodoroSessionCount);
      }
    };

    // Unified active style — single accent color
    const activeClass =
      "bg-[#F0F5F1] dark:bg-[#1F2C23] text-[#4D7C5D] dark:text-[#78C496] border-[#C4D7B2] dark:border-[#2D4534] shadow-sm";
    const inactiveClass =
      "text-slate-600 dark:text-slate-400 border-transparent hover:bg-white/50 dark:hover:bg-[#202228] hover:text-slate-800 dark:hover:text-slate-200";
    const subActiveClass =
      "text-[#4D7C5D] dark:text-[#78C496] font-bold bg-[#F0F5F1]/50 dark:bg-[#1F2C23]/50";
    const subInactiveClass =
      "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/30 dark:hover:bg-[#202228]/30";

    const NavButton = ({
      tab,
      icon,
      label,
      count,
    }: {
      tab: AppTab;
      icon: React.ReactNode;
      label: string;
      count?: number | null;
    }) => {
      const isActive = activeTab === tab;
      return (
        <button
          onClick={() => setActiveTab(tab)}
          className={`w-full flex items-center rounded-xl text-[13px] font-semibold tracking-wide transition-all border cursor-pointer ${
            isCollapsed ? "justify-center p-2" : "gap-3 px-3.5 py-2"
          } ${isActive ? activeClass : inactiveClass}`}
          title={isCollapsed ? label : undefined}
        >
          <div className="flex-shrink-0">{icon}</div>
          <span className={`flex-grow text-left whitespace-nowrap ${textClass}`}>{label}</span>
          {!isCollapsed && count != null && count > 0 && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                isActive
                  ? "bg-white/60 dark:bg-[#16171B]/60 text-[#4D7C5D] dark:text-[#78C496]"
                  : "bg-[#FAF8F5] dark:bg-[#22242A] text-slate-400 dark:text-slate-400"
              }`}
            >
              {count}
            </span>
          )}
        </button>
      );
    };

    const SubNavButton = ({
      tab,
      label,
      count,
    }: {
      tab: AppTab;
      label: string;
      count?: number | null;
    }) => {
      const isActive = activeTab === tab;
      return (
        <button
          onClick={() => setActiveTab(tab)}
          className={`w-full flex items-center gap-2 pl-10 pr-3.5 py-1.5 rounded-lg text-[12px] transition-all cursor-pointer ${
            isActive ? subActiveClass : subInactiveClass
          }`}
        >
          <span className="flex-grow text-left">{label}</span>
          {count != null && count > 0 && (
            <span className="text-[10px] text-slate-400 font-medium">{count}</span>
          )}
        </button>
      );
    };

    const GroupHeader = ({
      icon,
      label,
      expanded,
      onToggle,
      isGroupActive,
      count,
      groupDefaultTab,
    }: {
      icon: React.ReactNode;
      label: string;
      expanded: boolean;
      onToggle: () => void;
      isGroupActive: boolean;
      count?: number | null;
      groupDefaultTab: AppTab;
    }) => (
      <button
        onClick={() => {
          if (isCollapsed) {
            setActiveTab(groupDefaultTab);
          } else {
            onToggle();
          }
        }}
        className={`w-full flex items-center rounded-xl text-[13px] font-semibold tracking-wide transition-all border cursor-pointer ${
          isCollapsed ? "justify-center p-2" : "gap-3 px-3.5 py-2"
        } ${isGroupActive ? activeClass : inactiveClass}`}
        title={isCollapsed ? label : undefined}
      >
        <div className="flex-shrink-0">{icon}</div>
        <span className={`flex-grow text-left whitespace-nowrap ${textClass}`}>{label}</span>
        {!isCollapsed && count != null && count > 0 && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md mr-1 ${
              isGroupActive
                ? "bg-white/60 dark:bg-[#16171B]/60 text-[#4D7C5D] dark:text-[#78C496]"
                : "bg-[#FAF8F5] dark:bg-[#22242A] text-slate-400 dark:text-slate-400"
            }`}
          >
            {count}
          </span>
        )}
        {!isCollapsed &&
          (expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          ))}
      </button>
    );

    return (
      <aside
        className={`hidden md:flex flex-shrink-0 border-r border-[#EFEBE4] dark:border-[#282A30] bg-[#F4EFEA]/90 dark:bg-[#16171B] flex-col justify-between z-10 relative select-none overflow-y-auto custom-scrollbar transition-[width,padding] duration-300 ease-in-out ${
          isCollapsed ? "w-[54px] px-1.5 py-4" : "w-[210px] p-4"
        }`}
      >
        <div className="space-y-5 flex-shrink-0">
          {/* Logo — simplified */}
          <div
            className={`flex items-center gap-2.5 ${isCollapsed ? "justify-center px-0" : "px-1"}`}
          >
            <div className="w-8 h-8 overflow-hidden flex items-center justify-center flex-shrink-0 rounded-xl">
              <img src={logo} alt="logo" className="w-8 h-8 object-cover rounded-xl" />
            </div>
            <div className={`flex flex-col ${textClass}`}>
              <h1 className="text-[13px] font-bold tracking-wide text-[#2D323A] dark:text-slate-100 whitespace-nowrap">
                {t.app.title}
              </h1>
              <span className="text-[9px] text-slate-400 font-medium tracking-wider uppercase whitespace-nowrap">
                {t.app.subtitle}
              </span>
            </div>
          </div>

          {/* Progress — minimal */}
          {!isCollapsed && (
            <div className="px-1 animate-fade-in-up">
              <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 mb-1.5">
                <span>{s.progress}</span>
                <span className="text-[#4D7C5D] dark:text-[#78C496] font-bold">
                  {progressPercentage}%
                </span>
              </div>
              <div className="w-full h-1 bg-slate-100 dark:bg-[#252830] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#4D7C5D] dark:bg-[#6FAD84] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] text-slate-400 font-medium mt-1">
                <span>
                  {completedTasksCount} {s.completed}
                </span>
                <span>
                  {tasksCount} {s.remaining}
                </span>
              </div>
            </div>
          )}

          {/* Navigation — 5 primary destinations */}
          <nav className="space-y-0.5">
            {/* 1. Today / Home */}
            <NavButton tab="home" icon={<Home className="w-4 h-4" />} label={s.home} />

            {/* 2. Tasks (expandable: Matrix / List / Calendar) */}
            <div>
              <GroupHeader
                icon={<ListTodo className="w-4 h-4" />}
                label={s.list || "任务"}
                expanded={tasksExpanded}
                onToggle={() => {
                  if (!tasksExpanded) {
                    setTasksExpanded(true);
                    if (!TASKS_GROUP.includes(activeTab)) setActiveTab("matrix");
                  } else {
                    setTasksExpanded(false);
                  }
                }}
                isGroupActive={TASKS_GROUP.includes(activeTab)}
                count={tasksCount}
                groupDefaultTab="matrix"
              />
              {!isCollapsed && tasksExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  <SubNavButton tab="matrix" label={s.matrix || "四象限"} />
                  <SubNavButton tab="list" label={s.list || "列表"} count={tasksCount} />
                  <SubNavButton tab="calendar" label={s.calendar || "日历"} />
                </div>
              )}
            </div>

            {/* 3. Focus (expandable: Analytics) */}
            <div>
              <GroupHeader
                icon={<Timer className="w-4 h-4" />}
                label={s.focusMode || "专注"}
                expanded={focusExpanded}
                onToggle={() => {
                  if (!focusExpanded) {
                    setFocusExpanded(true);
                    if (!FOCUS_GROUP.includes(activeTab)) setActiveTab("analytics");
                  } else {
                    setFocusExpanded(false);
                  }
                }}
                isGroupActive={FOCUS_GROUP.includes(activeTab)}
                groupDefaultTab="analytics"
              />
              {!isCollapsed && focusExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  <SubNavButton tab="analytics" label={s.analytics || "统计"} />
                </div>
              )}
            </div>

            {/* 4. Notes */}
            <NavButton
              tab="notes"
              icon={<StickyNote className="w-4 h-4" />}
              label={s.notes}
              count={stickyNotesCount}
            />

            {/* 4.2 Journal / Daily Notes */}
            <NavButton
              tab="journal"
              icon={<BookOpen className="w-4 h-4" />}
              label={s.journal || "日记手账"}
              count={null}
            />

            {/* 4.5. News / RSS */}
            <NavButton
              tab="news"
              icon={<Newspaper className="w-4 h-4" />}
              label={s.news || "朝花夕拾"}
            />

            {/* 5. Archive (expandable: Completed / Countdown) */}
            <div>
              <GroupHeader
                icon={<Archive className="w-4 h-4" />}
                label={s.history || "归档"}
                expanded={archiveExpanded}
                onToggle={() => {
                  if (!archiveExpanded) {
                    setArchiveExpanded(true);
                    if (!ARCHIVE_GROUP.includes(activeTab)) setActiveTab("completed");
                  } else {
                    setArchiveExpanded(false);
                  }
                }}
                isGroupActive={ARCHIVE_GROUP.includes(activeTab)}
                count={completedTasksCount}
                groupDefaultTab="completed"
              />
              {!isCollapsed && archiveExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  <SubNavButton
                    tab="completed"
                    label={s.history || "已完成"}
                    count={completedTasksCount}
                  />
                  <SubNavButton tab="memory" label={s.memory || "时光长廊"} />
                  <SubNavButton
                    tab="countdown"
                    label={s.countdown || "倒计时"}
                    count={countdownCount}
                  />
                </div>
              )}
            </div>
          </nav>

          {/* Flow Mode — accent button */}
          <button
            onClick={onEnterFlowMode}
            className={`w-full flex items-center rounded-xl text-[13px] font-semibold tracking-wide transition-all border border-[#4D7C5D]/20 dark:border-[#4D7C5D]/30 text-[#4D7C5D] dark:text-[#78C496] bg-[#F0F5F1]/50 dark:bg-[#1F2C23]/40 hover:bg-[#F0F5F1] dark:hover:bg-[#1F2C23]/80 cursor-pointer ${
              isCollapsed ? "justify-center p-2" : "gap-3 px-3.5 py-2.5"
            }`}
            title={isCollapsed ? t.flow?.title || "心流模式" : undefined}
          >
            <div className="flex-shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <span className={`flex-grow text-left whitespace-nowrap ${textClass}`}>
              {t.flow?.title || "心流模式"}
            </span>
            {!isCollapsed && tasksCount > 0 && (
              <span className="text-[10px] font-bold bg-[#4D7C5D]/10 dark:bg-[#78C496]/20 text-[#4D7C5D] dark:text-[#78C496] px-1.5 py-0.5 rounded-md">
                {tasksCount}
              </span>
            )}
          </button>

          {/* Compact Pomodoro Timer */}
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => {
                  const nextActive = !pomodoroIsActive;
                  setPomodoroIsActive(nextActive);
                  if (nextActive) {
                    void audioEngine.ensureAudioContext();
                  }
                  syncPomodoro(
                    nextActive,
                    pomodoroTimeLeft,
                    pomodoroIsBreak,
                    focusDuration,
                    breakDuration,
                    pomodoroSessionCount,
                  );
                  applyAutoNoise(nextActive, pomodoroIsBreak);
                }}
                className={`w-9 h-9 rounded-xl border border-[#EFEBE4] dark:border-[#282A30] bg-white/60 dark:bg-[#202228] flex items-center justify-center text-[#4D7C5D] dark:text-[#78C496] hover:bg-white dark:hover:bg-[#262830] transition-all cursor-pointer relative ${
                  pomodoroIsActive ? "pomodoro-active-glow ring-2 ring-[#4D7C5D]/20" : ""
                }`}
                title={`${pomodoroIsBreak ? s.breakMode : s.focusMode}: ${Math.floor(
                  pomodoroTimeLeft / 60,
                )
                  .toString()
                  .padStart(2, "0")}:${(pomodoroTimeLeft % 60).toString().padStart(2, "0")}`}
              >
                <Clock className="w-4 h-4" />
                {pomodoroIsActive && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-pulse" />
                )}
              </button>
            </div>
          ) : (
            <div
              data-task-id={pomodoroTaskId || ""}
              className={`px-3.5 py-3 rounded-xl bg-white/60 dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#282A30] space-y-2.5 ${pomodoroIsActive ? "pomodoro-active-glow" : ""}`}
            >
              <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#78C496]" />
                  <span>{pomodoroIsBreak ? s.breakMode : s.focusMode}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {onOpenEnergyTimeBlock && (
                    <button
                      type="button"
                      onClick={onOpenEnergyTimeBlock}
                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-[#33353A] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      title="精力潮汐与时间盒看板"
                    >
                      <Zap className="w-3 h-3" />
                    </button>
                  )}
                  <span className="text-[9px] text-slate-400 dark:text-slate-500">
                    #{pomodoroSessionCount}
                  </span>
                </div>
              </div>

              {pomodoroTaskTitle && (
                <div
                  className="text-[10px] font-medium text-slate-500 dark:text-slate-300 truncate px-2 py-1 rounded bg-slate-50 dark:bg-[#252830] border border-slate-100 dark:border-[#2E313A] text-center"
                  title={pomodoroTaskTitle}
                >
                  {pomodoroTaskTitle}
                </div>
              )}

              {/* Timer & Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const currentMins = Math.floor(pomodoroTimeLeft / 60);
                      if (currentMins > 1) {
                        const newTime = (currentMins - 1) * 60;
                        if (pomodoroIsActive) {
                          setPomodoroEndTime(Date.now() + newTime * 1000);
                        }
                        setPomodoroTimeLeft(newTime);
                        if (pomodoroIsBreak) {
                          setBreakDuration(currentMins - 1);
                          localStorage.setItem("pomodoro_break_duration", String(currentMins - 1));
                          syncPomodoro(
                            pomodoroIsActive,
                            newTime,
                            true,
                            focusDuration,
                            currentMins - 1,
                            pomodoroSessionCount,
                          );
                        } else {
                          setFocusDuration(currentMins - 1);
                          localStorage.setItem("pomodoro_focus_duration", String(currentMins - 1));
                          syncPomodoro(
                            pomodoroIsActive,
                            newTime,
                            false,
                            currentMins - 1,
                            breakDuration,
                            pomodoroSessionCount,
                          );
                        }
                      }
                    }}
                    className="w-4 h-4 rounded-full bg-slate-50 dark:bg-[#252830] hover:bg-slate-100 dark:hover:bg-[#2E313A] border border-slate-200 dark:border-[#33353A] flex items-center justify-center text-slate-400 dark:text-slate-300 font-bold text-[10px] cursor-pointer transition-colors"
                    title={s.decreaseMin}
                  >
                    -
                  </button>
                  {editingMinutes !== null ? (
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={editingMinutes}
                      onChange={(e) => setEditingMinutes(e.target.value)}
                      onBlur={(e) => commitMinutes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitMinutes((e.target as HTMLInputElement).value);
                        if (e.key === "Escape") setEditingMinutes(null);
                      }}
                      autoFocus
                      className="w-16 text-xl font-bold font-mono text-[#2D323A] dark:text-slate-100 tracking-tight bg-transparent border-b-2 border-[#4D7C5D] outline-none text-center"
                    />
                  ) : (
                    <span
                      onClick={() =>
                        !pomodoroIsActive &&
                        setEditingMinutes(String(Math.floor(pomodoroTimeLeft / 60)))
                      }
                      className={`text-xl font-bold font-mono text-[#2D323A] dark:text-slate-100 tracking-tight ${!pomodoroIsActive ? "cursor-pointer hover:text-[#4D7C5D] dark:hover:text-[#78C496] transition-colors" : ""}`}
                    >
                      {Math.floor(pomodoroTimeLeft / 60)
                        .toString()
                        .padStart(2, "0")}
                      :{(pomodoroTimeLeft % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      const currentMins = Math.floor(pomodoroTimeLeft / 60);
                      if (currentMins < 120) {
                        const newTime = (currentMins + 1) * 60;
                        if (pomodoroIsActive) {
                          setPomodoroEndTime(Date.now() + newTime * 1000);
                        }
                        setPomodoroTimeLeft(newTime);
                        if (pomodoroIsBreak) {
                          setBreakDuration(currentMins + 1);
                          localStorage.setItem("pomodoro_break_duration", String(currentMins + 1));
                          syncPomodoro(
                            pomodoroIsActive,
                            newTime,
                            true,
                            focusDuration,
                            currentMins + 1,
                            pomodoroSessionCount,
                          );
                        } else {
                          setFocusDuration(currentMins + 1);
                          localStorage.setItem("pomodoro_focus_duration", String(currentMins + 1));
                          syncPomodoro(
                            pomodoroIsActive,
                            newTime,
                            false,
                            currentMins + 1,
                            breakDuration,
                            pomodoroSessionCount,
                          );
                        }
                      }
                    }}
                    className="w-4 h-4 rounded-full bg-slate-50 dark:bg-[#252830] hover:bg-slate-100 dark:hover:bg-[#2E313A] border border-slate-200 dark:border-[#33353A] flex items-center justify-center text-slate-400 dark:text-slate-300 font-bold text-[10px] cursor-pointer transition-colors"
                    title={s.increaseMin}
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const nextActive = !pomodoroIsActive;
                      setPomodoroIsActive(nextActive);
                      if (nextActive) {
                        void audioEngine.ensureAudioContext();
                      }
                      syncPomodoro(
                        nextActive,
                        pomodoroTimeLeft,
                        pomodoroIsBreak,
                        focusDuration,
                        breakDuration,
                        pomodoroSessionCount,
                      );
                      applyAutoNoise(nextActive, pomodoroIsBreak);
                    }}
                    className="p-1 rounded-lg border border-slate-200 dark:border-[#33353A] hover:bg-slate-50 dark:hover:bg-[#252830] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                    title={pomodoroIsActive ? s.pause : s.startFocus}
                  >
                    {pomodoroIsActive ? (
                      <svg
                        className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#78C496]"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#78C496]"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setPomodoroIsActive(false);
                      const nextTime = pomodoroIsBreak ? breakDuration * 60 : focusDuration * 60;
                      setPomodoroTimeLeft(nextTime);
                      setPomodoroTaskId(null);
                      setPomodoroTaskTitle(null);
                      syncPomodoro(
                        false,
                        nextTime,
                        pomodoroIsBreak,
                        focusDuration,
                        breakDuration,
                        pomodoroSessionCount,
                        null,
                        null,
                      );
                      applyAutoNoise(false, pomodoroIsBreak);
                    }}
                    className="p-1 rounded-lg border border-slate-200 dark:border-[#33353A] hover:bg-slate-50 dark:hover:bg-[#252830] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title={s.resetTimer}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-0.5 bg-slate-100 dark:bg-[#2A2D35] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-1000 ease-linear rounded-full bg-[#4D7C5D] dark:bg-[#78C496]"
                  style={{
                    width: `${
                      (pomodoroTimeLeft /
                        (pomodoroIsBreak ? breakDuration * 60 : focusDuration * 60)) *
                      100
                    }%`,
                  }}
                />
              </div>

              {/* Random Micro-Break Toggle & Interval Switcher & Preview */}
              <div className="flex items-center justify-between pt-1.5 text-[9px] text-slate-400 font-medium">
                <span
                  className="flex items-center gap-1.5 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300"
                  title="专注时随机提醒：喝水润喉、眺望窗外、深呼吸与伸展（每次5秒）"
                  onClick={() => {
                    const next = !randomBreakEnabled;
                    setRandomBreakEnabled(next);
                    localStorage.setItem("tongyun_random_break", String(next));
                    if (next) void audioEngine.playMicroBreakSound();
                  }}
                >
                  <Timer className="w-3 h-3 text-slate-400" />
                  <span>{s.randomBreak || "微休息"}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {/* 时长切换按钮（循环 3~5分 / 5~10分 / 1~2分 / 30秒测试） */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const intervals: Array<"3-5" | "5-10" | "1-2" | "test-30s"> = [
                        "3-5",
                        "5-10",
                        "1-2",
                        "test-30s",
                      ];
                      const currentIdx = intervals.indexOf(microBreakInterval || "3-5");
                      const nextInterval = intervals[(currentIdx + 1) % intervals.length];
                      setMicroBreakInterval(nextInterval);
                      localStorage.setItem("tongyun_random_break_interval", nextInterval);
                    }}
                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#33353A] hover:bg-slate-100 dark:hover:bg-[#33353A] text-slate-500 hover:text-[#4D7C5D] dark:hover:text-[#78A887] text-[8px] font-mono font-semibold transition-colors cursor-pointer"
                    title={`点击切换提醒间隔：当前每 ${
                      microBreakInterval === "test-30s"
                        ? "15~30秒（极速测试）"
                        : microBreakInterval === "1-2"
                          ? "1~2分钟"
                          : microBreakInterval === "5-10"
                            ? "5~10分钟"
                            : "3~5分钟"
                    } 随机提醒`}
                  >
                    {microBreakInterval === "test-30s"
                      ? "30s测"
                      : microBreakInterval === "1-2"
                        ? "1~2m"
                        : microBreakInterval === "5-10"
                          ? "5~10m"
                          : "3~5m"}
                  </button>

                  {/* 立即体验 5 秒弹窗预览按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onTestMicroBreak) {
                        onTestMicroBreak();
                      } else {
                        void audioEngine.playMicroBreakSound();
                      }
                    }}
                    className="px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[8px] font-semibold transition-colors cursor-pointer flex items-center gap-0.5"
                    title="立即体验 5 秒微休息（随机喝水、眺望窗外或深呼吸卡片）"
                  >
                    <Volume2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                    <span>体验5s</span>
                  </button>

                  {/* 开关 Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !randomBreakEnabled;
                      setRandomBreakEnabled(next);
                      localStorage.setItem("tongyun_random_break", String(next));
                      if (next) {
                        void audioEngine.playMicroBreakSound();
                      }
                    }}
                    className={`relative w-7 h-3.5 rounded-full transition-colors cursor-pointer ${
                      randomBreakEnabled ? "bg-[#4D7C5D]" : "bg-slate-200 dark:bg-[#33353A]"
                    }`}
                    title={s.randomBreakDesc || "专注中随机提醒喝水、看窗外、舒展护眼"}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform ${
                        randomBreakEnabled ? "translate-x-3.5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Auto Noise on Focus */}
              <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
                <span className="flex items-center gap-1.5">
                  <Coffee className="w-3 h-3 text-slate-400" />
                  <span>{s.autoNoise}</span>
                </span>
                <button
                  onClick={() => {
                    const next = !autoNoiseEnabled;
                    setAutoNoiseEnabled(next);
                    localStorage.setItem("tongyun_auto_noise", String(next));
                    if (next) {
                      startNoise(selectedNoiseType, noiseVolume);
                    } else {
                      stopNoise("manual");
                    }
                  }}
                  className={`relative w-7 h-3.5 rounded-full transition-colors cursor-pointer ${
                    autoNoiseEnabled ? "bg-[#4D7C5D]" : "bg-slate-200 dark:bg-[#33353A]"
                  }`}
                  title={s.autoNoiseDesc}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform ${
                      autoNoiseEnabled ? "translate-x-3.5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* White Noise — collapsible */}
              <div className="pt-1.5 border-t border-slate-100 dark:border-[#282A30] space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={() => setNoiseControlsExpanded((prev) => !prev)}
                    className="flex items-center gap-1.5 hover:text-[#4D7C5D] dark:hover:text-[#78C496] transition-colors cursor-pointer select-none"
                  >
                    <Coffee className="w-3 h-3 text-slate-400" />
                    <span>{s.noise}</span>
                    {noiseControlsExpanded ? (
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {isPlayingNoise && !noiseControlsExpanded && (
                      <span className="text-[9px] text-[#4D7C5D] dark:text-[#78C496] font-bold animate-pulse">
                        播放中
                      </span>
                    )}
                    <button
                      onClick={() => {
                        if (isPlayingNoise) {
                          stopNoise();
                        } else {
                          startNoise(selectedNoiseType, noiseVolume);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-md border text-[9px] font-semibold transition-all cursor-pointer ${
                        isPlayingNoise
                          ? "bg-[#4D7C5D]/10 dark:bg-[#4D7C5D]/20 border-[#4D7C5D]/20 dark:border-[#4D7C5D]/40 text-[#4D7C5D] dark:text-[#78C496]"
                          : "bg-slate-50 dark:bg-[#252830] border-slate-200 dark:border-[#33353A] text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2E313A]"
                      }`}
                    >
                      {isPlayingNoise ? s.mute : s.play}
                    </button>
                  </div>
                </div>

                {noiseControlsExpanded && (
                  <div className="space-y-1.5 pt-1 animate-fade-in-up">
                    <div className="grid grid-cols-4 gap-1">
                      {visibleNoiseDefs.map((sound) => (
                        <button
                          key={sound.id}
                          onClick={() => {
                            setSelectedNoiseType(sound.id);
                            startNoise(sound.id, noiseVolume);
                          }}
                          className={`h-5.5 rounded-md text-[9px] font-medium flex items-center justify-center transition-all cursor-pointer ${
                            selectedNoiseType === sound.id
                              ? "bg-[#4D7C5D]/10 dark:bg-[#4D7C5D]/20 text-[#4D7C5D] dark:text-[#78C496] font-semibold border border-[#4D7C5D]/20 dark:border-[#4D7C5D]/40"
                              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#252830]"
                          }`}
                          title={(s as any)[sound.titleKey]}
                        >
                          {(s as any)[sound.labelKey]}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-0.5 animate-fade-in-up">
                      <span className="text-[8px] text-slate-400 font-medium uppercase flex-shrink-0">
                        {s.volume}
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={noiseVolume}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setNoiseVolume(val);
                          audioEngine.setVolume(val);
                          if (!isPlayingNoise && val > 0) {
                            startNoise(selectedNoiseType, val);
                          }
                        }}
                        className="flex-grow accent-[#4D7C5D] h-0.5 bg-slate-100 dark:bg-[#2A2D35] rounded-lg cursor-pointer"
                        title={`音量: ${Math.round(noiseVolume * 100)}%`}
                      />
                      <span className="text-[8px] text-slate-400 font-mono w-5 text-right flex-shrink-0">
                        {Math.round(noiseVolume * 100)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-0.5 text-[9px] text-slate-400 font-medium">
                      <span>{s.soundSelect}</span>
                      <select
                        value={alertSoundType}
                        onChange={(e) => {
                          const val = e.target.value as AlertSoundType;
                          setAlertSoundType(val);
                          localStorage.setItem("aero_alert_sound_type", val);
                          setTimeout(() => audioEngine.playCompletionSound(val), 50);
                        }}
                        className="text-[9px] bg-white dark:bg-[#202228] border border-slate-200 dark:border-[#33353A] rounded-md px-1.5 py-0.5 text-slate-600 dark:text-slate-200 font-medium cursor-pointer outline-none focus:border-[#4D7C5D]/40"
                      >
                        {[
                          { id: "beep", label: s.beep },
                          { id: "cuckoo", label: s.cuckoo },
                          { id: "meow", label: s.meow },
                          { id: "chime", label: s.chime },
                          { id: "ding", label: s.ding },
                          { id: "phone", label: s.phone },
                          { id: "marimba", label: s.marimba },
                          { id: "bells", label: s.bells },
                          { id: "alarm", label: s.alarm },
                        ].map((snd) => (
                          <option key={snd.id} value={snd.id}>
                            {snd.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom section */}
        <div className="space-y-1.5 pt-3 border-t border-slate-200/60 dark:border-[#282A30] flex-shrink-0">
          {/* WebDAV sync status */}
          {hasWebdavUrl && (
            <div
              className={`pb-1.5 text-[9px] flex items-center text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-[#282A30] mb-1.5 select-none ${isCollapsed ? "justify-center" : "justify-between"}`}
            >
              <div className="flex items-center gap-1">
                {syncStatus === "syncing" ? (
                  <RefreshCw className="w-3 h-3 text-[#4D7C5D] dark:text-[#78C496] animate-spin" />
                ) : syncStatus === "error" ? (
                  <Cloud className="w-3 h-3 text-red-400" />
                ) : (
                  <Cloud className="w-3 h-3 text-[#4D7C5D] dark:text-[#78C496]" />
                )}
                {!isCollapsed && (
                  <span>
                    {syncStatus === "syncing"
                      ? s.syncSyncing
                      : syncStatus === "error"
                        ? s.syncError
                        : s.syncSynced}
                  </span>
                )}
              </div>
              {!isCollapsed && lastBackupTime && (
                <span className="text-slate-400 dark:text-slate-500">
                  {new Date(lastBackupTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}

          {/* Settings — now a bottom icon button */}
          <NavButton tab="settings" icon={<Settings className="w-4 h-4" />} label={s.settings} />

          {/* Quick Capture & Sunset Shutdown tools */}
          <div className="grid grid-cols-2 gap-1.5 w-full">
            {onOpenQuickCapture && (
              <button
                onClick={onOpenQuickCapture}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-all text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50/60 dark:hover:bg-orange-950/20 border border-slate-200/60 dark:border-[#2E313A] cursor-pointer ${
                  isCollapsed ? "p-2 col-span-2" : ""
                }`}
                title="极速捕捉灵感 (Alt+N / Ctrl+Shift+K)"
              >
                <Command className="w-3 h-3 text-orange-500" />
                {!isCollapsed && <span>极速捕捉</span>}
              </button>
            )}
            {onOpenSunsetShutdown && (
              <button
                onClick={onOpenSunsetShutdown}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-all text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 border border-slate-200/60 dark:border-[#2E313A] cursor-pointer ${
                  isCollapsed ? "p-2 col-span-2" : ""
                }`}
                title="日落离线仪轨 (下班收官)"
              >
                <Sunset className="w-3 h-3 text-rose-500" />
                {!isCollapsed && <span>日落关机</span>}
              </button>
            )}
          </div>

          {/* Widget & utility buttons */}
          <button
            onClick={handleToggleWidget}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#202228] border border-slate-200/60 dark:border-[#2E313A] cursor-pointer ${
              isCollapsed ? "p-2" : "px-3"
            }`}
            title={isCollapsed ? s.widget : undefined}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {!isCollapsed && <span>{s.widget}</span>}
          </button>

          {isCollapsed ? (
            <div className="flex flex-col gap-1.5 items-center w-full">
              <button
                onClick={() => handleToggleWidgetLock()}
                className={`w-9 h-9 flex items-center justify-center rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${
                  isWidgetLocked
                    ? "text-[#4D7C5D] dark:text-[#78C496] bg-[#F0F5F1] dark:bg-[#1F2C23] border-[#C4D7B2]/30 dark:border-[#2D4534]"
                    : "text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-[#2E313A] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202228]"
                }`}
                title={isWidgetLocked ? s.unlockWidget : s.lockWidget}
              >
                {isWidgetLocked ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={resetTasks}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[10px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-[#2E313A] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202228] transition-all cursor-pointer"
                title={s.reset}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleToggleWidgetLock()}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${
                  isWidgetLocked
                    ? "text-[#4D7C5D] dark:text-[#78C496] bg-[#F0F5F1] dark:bg-[#1F2C23] border-[#C4D7B2]/30 dark:border-[#2D4534]"
                    : "text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-[#2E313A] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202228]"
                }`}
              >
                {isWidgetLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {isWidgetLocked ? s.unlockWidget : s.lockWidget}
              </button>
              <button
                onClick={resetTasks}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-[#2E313A] bg-transparent hover:bg-slate-50 dark:hover:bg-[#202228] transition-all cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                {s.reset}
              </button>
            </div>
          )}

          {/* Collapse / Expand Toggle Button */}
          <button
            onClick={toggleCollapsed}
            className="w-full flex items-center justify-center py-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202228] border border-transparent hover:border-slate-200/60 dark:hover:border-[#2E313A] transition-all cursor-pointer mt-1"
            title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <div className="flex items-center gap-2 text-[11px] font-medium">
                <ChevronLeft className="w-4 h-4" />
                <span>收起侧边栏</span>
              </div>
            )}
          </button>
        </div>
      </aside>
    );
  },
);

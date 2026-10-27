import React from "react";
import {
  X,
  LayoutGrid,
  ListTodo,
  Calendar,
  StickyNote,
  Clock,
  Archive,
  Newspaper,
  Compass,
  Sunset,
  Zap,
  Settings,
  ChevronRight,
  BookOpen,
  Sparkles,
} from "lucide-react";
import type { AppTab } from "../../types";
import { useTranslation } from "../../i18n/LanguageContext";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onOpenSunsetShutdown?: () => void;
  onOpenEnergyTimeBlock?: () => void;
  onEnterFlowMode?: () => void;
  tasksCount?: number;
  completedTasksCount?: number;
  stickyNotesCount?: number;
  countdownCount?: number;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = React.memo(
  ({
    isOpen,
    onClose,
    activeTab,
    setActiveTab,
    onOpenSunsetShutdown,
    onOpenEnergyTimeBlock,
    onEnterFlowMode,
    tasksCount = 0,
    completedTasksCount = 0,
    stickyNotesCount = 0,
    countdownCount = 0,
  }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    const handleSelectTab = (tab: AppTab) => {
      setActiveTab(tab);
      onClose();
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      >
        <div
          className="w-full max-h-[85vh] bg-[#FCFBF7] dark:bg-[#18191E] rounded-t-3xl border-t border-[#ECE5D4] dark:border-[#2D3039] flex flex-col shadow-2xl overflow-hidden animate-slide-up pb-safe"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 顶部把手与标题 */}
          <div className="pt-3 pb-2 px-5 flex items-center justify-between border-b border-[#EFEBE4] dark:border-[#282A30] shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto" />
              <span className="text-xs font-bold text-[#2D323A] dark:text-slate-100">
                全部功能与视图
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252830] transition-colors cursor-pointer"
              aria-label="关闭抽屉"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 抽屉内容滚动区 */}
          <div className="overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar flex-grow">
            {/* 1. 核心视图 */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">
                效率与手帐视图
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectTab("matrix")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "matrix"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <LayoutGrid className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.matrix || "四象限"}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("list")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "list"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ListTodo className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.list || "任务列表"}</span>
                  </div>
                  {tasksCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#282B33] text-slate-500 font-mono">
                      {tasksCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("journal")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "journal"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.journal || "手帐日记"}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("calendar")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "calendar"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.calendar || "日历计划"}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("notes")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "notes"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <StickyNote className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.stickyNotes || "便签墙"}</span>
                  </div>
                  {stickyNotesCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#282B33] text-slate-500 font-mono">
                      {stickyNotesCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("countdown")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "countdown"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.countdown || "倒数日"}</span>
                  </div>
                  {countdownCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#282B33] text-slate-500 font-mono">
                      {countdownCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("memory")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "memory"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.memory || "时光长廊"}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("completed")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "completed"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Archive className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.completed || "已归档"}</span>
                  </div>
                  {completedTasksCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#282B33] text-slate-500 font-mono">
                      {completedTasksCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("news")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "news"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Newspaper className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.news || "资讯速递"}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab("gantt")}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    activeTab === "gantt"
                      ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                      : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Compass className="w-4 h-4" />
                    <span className="text-xs">{t.sidebar.gantt || "甘特图"}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                </button>
              </div>
            </div>

            {/* 2. 专注与仪式 */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">
                专注工作流
              </div>
              <div className="space-y-2">
                {onEnterFlowMode && (
                  <button
                    type="button"
                    onClick={() => {
                      onEnterFlowMode();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/80 dark:bg-[#202228] border border-[#EFEBE4] dark:border-[#2E313A] text-slate-700 dark:text-slate-200 hover:bg-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-[#EAF3EC] dark:bg-[#202E24] text-[#4D7C5D] dark:text-[#78C496]">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-bold">进入沉浸心流</div>
                        <div className="text-[10px] text-slate-400">单任务全屏专注番茄体验</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>
                )}

                {onOpenEnergyTimeBlock && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenEnergyTimeBlock();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/80 dark:bg-[#202228] border border-[#EFEBE4] dark:border-[#2E313A] text-slate-700 dark:text-slate-200 hover:bg-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-[#FEF7EC] dark:bg-[#2B2317] text-[#B45309] dark:text-[#FBBF24]">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-bold">精力时间块</div>
                        <div className="text-[10px] text-slate-400">规划高/中/低精力时间段分配</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>
                )}

                {onOpenSunsetShutdown && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSunsetShutdown();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/80 dark:bg-[#202228] border border-[#EFEBE4] dark:border-[#2E313A] text-slate-700 dark:text-slate-200 hover:bg-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-[#FCF2F0] dark:bg-[#2E1818] text-[#A34E36] dark:text-[#F87171]">
                        <Sunset className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-bold">日落关机仪式</div>
                        <div className="text-[10px] text-slate-400">今日总结与明日待办铺设</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>
                )}
              </div>
            </div>

            {/* 3. 系统设置 */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">
                偏好与设置
              </div>
              <button
                type="button"
                onClick={() => handleSelectTab("settings")}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  activeTab === "settings"
                    ? "bg-[#EAF3EC] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#202E24] dark:text-[#78C496] dark:border-[#2D4534] font-bold"
                    : "bg-white/80 dark:bg-[#202228] text-slate-700 dark:text-slate-200 border-[#EFEBE4] dark:border-[#2E313A] hover:bg-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4" />
                  <span className="text-xs">{t.sidebar.settings || "应用设置与云同步"}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-40" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

MobileDrawer.displayName = "MobileDrawer";

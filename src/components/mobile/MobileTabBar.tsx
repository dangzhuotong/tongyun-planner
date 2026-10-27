import React from "react";
import { Home, LayoutGrid, BookOpen, Timer, MoreHorizontal } from "lucide-react";
import type { AppTab } from "../../types";
import { useTranslation } from "../../i18n/LanguageContext";

interface MobileTabBarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onOpenDrawer: () => void;
  tasksCount?: number;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = React.memo(
  ({ activeTab, setActiveTab, onOpenDrawer, tasksCount = 0 }) => {
    const { t } = useTranslation();

    const isTasksActive =
      activeTab === "matrix" || activeTab === "list" || activeTab === "calendar";
    const isMoreActive = [
      "notes",
      "countdown",
      "memory",
      "news",
      "gantt",
      "completed",
      "settings",
    ].includes(activeTab);

    return (
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 pb-safe bg-[#FCFBF7]/95 dark:bg-[#18191E]/95 backdrop-blur-lg border-t border-[#ECE5D4] dark:border-[#2D3039] select-none transition-colors"
        aria-label="移动端底部导航"
      >
        <div className="h-16 px-2 flex items-center justify-around max-w-lg mx-auto">
          {/* 1. 今日 */}
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === "home"
                ? "text-[#4D7C5D] dark:text-[#78C496] font-bold"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "home" ? "bg-[#EAF3EC] dark:bg-[#202E24]" : ""
              }`}
            >
              <Home className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{t.sidebar.home || "今日"}</span>
          </button>

          {/* 2. 待办 (四象限) */}
          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all relative cursor-pointer ${
              isTasksActive
                ? "text-[#4D7C5D] dark:text-[#78C496] font-bold"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors relative ${
                isTasksActive ? "bg-[#EAF3EC] dark:bg-[#202E24]" : ""
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
              {tasksCount > 0 && (
                <span className="absolute -top-1 -right-1.5 px-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-[#E57C58] text-white text-[9px] font-bold">
                  {tasksCount > 99 ? "99+" : tasksCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{t.sidebar.list || "待办"}</span>
          </button>

          {/* 3. 手帐 (日记) */}
          <button
            type="button"
            onClick={() => setActiveTab("journal")}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === "journal"
                ? "text-[#4D7C5D] dark:text-[#78C496] font-bold"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "journal" ? "bg-[#EAF3EC] dark:bg-[#202E24]" : ""
              }`}
            >
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{t.sidebar.journal || "手帐"}</span>
          </button>

          {/* 4. 专注 (统计/番茄) */}
          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "text-[#4D7C5D] dark:text-[#78C496] font-bold"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "analytics" ? "bg-[#EAF3EC] dark:bg-[#202E24]" : ""
              }`}
            >
              <Timer className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">
              {t.sidebar.focusMode || "专注"}
            </span>
          </button>

          {/* 5. 更多 (打开抽屉) */}
          <button
            type="button"
            onClick={onOpenDrawer}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all cursor-pointer ${
              isMoreActive
                ? "text-[#4D7C5D] dark:text-[#78C496] font-bold"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                isMoreActive ? "bg-[#EAF3EC] dark:bg-[#202E24]" : ""
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">更多</span>
          </button>
        </div>
      </nav>
    );
  },
);

MobileTabBar.displayName = "MobileTabBar";

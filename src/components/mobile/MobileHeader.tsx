import React from "react";
import { Menu, Plus, Cloud, RefreshCw, AlertCircle } from "lucide-react";
import type { AppTab } from "../../types";
import { useTranslation } from "../../i18n/LanguageContext";
import logo from "../../assets/logo.png";

interface MobileHeaderProps {
  activeTab: AppTab;
  onOpenDrawer: () => void;
  onOpenQuickCapture?: () => void;
  syncStatus: "synced" | "syncing" | "error";
  lastBackupTime: number | null;
}

export const MobileHeader: React.FC<MobileHeaderProps> = React.memo(
  ({ activeTab, onOpenDrawer, onOpenQuickCapture, syncStatus }) => {
    const { t } = useTranslation();

    const getTabTitle = (tab: AppTab): string => {
      switch (tab) {
        case "home":
          return t.sidebar.home || "今日";
        case "matrix":
          return t.sidebar.matrix || "四象限";
        case "list":
          return t.sidebar.list || "任务列表";
        case "calendar":
          return t.sidebar.calendar || "日历";
        case "journal":
          return t.sidebar.journal || "手帐日记";
        case "analytics":
          return t.sidebar.analytics || "专注统计";
        case "notes":
          return t.sidebar.stickyNotes || "便签墙";
        case "countdown":
          return t.sidebar.countdown || "倒数日";
        case "memory":
          return t.sidebar.memory || "时光长廊";
        case "news":
          return t.sidebar.news || "资讯速递";
        case "gantt":
          return t.sidebar.gantt || "甘特图";
        case "completed":
          return t.sidebar.completed || "已归档";
        case "settings":
          return t.sidebar.settings || "系统设置";
        default:
          return t.app.title || "橦云手帐";
      }
    };

    return (
      <header className="sticky top-0 z-30 w-full pt-safe bg-[#FAF7F0]/95 dark:bg-[#16171B]/95 backdrop-blur-md border-b border-[#EFEBE4] dark:border-[#282A30] transition-colors select-none">
        <div className="h-14 px-4 flex items-center justify-between">
          {/* 左侧：菜单按钮 + 标题 */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/80 dark:bg-[#202228] border border-[#EFEBE4] dark:border-[#2E313A] text-slate-600 dark:text-slate-300 active:scale-95 transition-transform cursor-pointer shadow-2xs"
              aria-label="打开菜单"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <img src={logo} alt="logo" className="w-6 h-6 object-cover rounded-lg shadow-2xs" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#2D323A] dark:text-slate-100 tracking-tight leading-tight">
                  {t.app.title}
                </span>
                <span className="text-[10px] text-[#4D7C5D] dark:text-[#78C496] font-semibold leading-tight">
                  {getTabTitle(activeTab)}
                </span>
              </div>
            </div>
          </div>

          {/* 右侧：同步状态 + 快捷新建 */}
          <div className="flex items-center gap-2">
            {/* 云同步状态小徽标 */}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border ${
                syncStatus === "synced"
                  ? "bg-[#F0F5F1] text-[#4D7C5D] border-[#DEEAE2] dark:bg-[#1E2721] dark:text-[#78C496] dark:border-[#2B3B2F]"
                  : syncStatus === "syncing"
                    ? "bg-[#FEF7EC] text-[#B45309] border-[#FDE68A] dark:bg-[#2B2317] dark:text-[#FBBF24] dark:border-[#4B3B24]"
                    : "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA] dark:bg-[#2E1818] dark:text-[#F87171] dark:border-[#4D2828]"
              }`}
              title={
                syncStatus === "synced"
                  ? "云端已同步"
                  : syncStatus === "syncing"
                    ? "同步中..."
                    : "同步异常"
              }
            >
              {syncStatus === "syncing" ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : syncStatus === "error" ? (
                <AlertCircle className="w-3 h-3 text-red-500" />
              ) : (
                <Cloud className="w-3 h-3 text-[#4D7C5D] dark:text-[#78C496]" />
              )}
              <span className="hidden xs:inline">
                {syncStatus === "synced" ? "同步" : syncStatus === "syncing" ? "同步中" : "异常"}
              </span>
            </div>

            {/* 快速捕捉按钮 */}
            {onOpenQuickCapture && (
              <button
                type="button"
                onClick={onOpenQuickCapture}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#4D7C5D] hover:bg-[#3F684C] text-white active:scale-95 transition-transform shadow-xs cursor-pointer"
                aria-label="快速捕捉"
                title="快速捕捉"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>
    );
  },
);

MobileHeader.displayName = "MobileHeader";

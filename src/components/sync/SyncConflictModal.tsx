import React, { useState } from "react";
import { AlertTriangle, AlertCircle, Loader2 } from "lucide-react";
import type { SyncConflict, SyncCategory } from "../../utils/sync/types";
import { useTranslation } from "../../i18n/LanguageContext";

interface SyncConflictModalProps {
  conflicts: SyncConflict[];
  onResolve: (choice: "local" | "remote") => Promise<void>;
  onClose: () => void;
}

const CATEGORY_NAMES: Record<SyncCategory, string> = {
  tasks: "待办",
  completedTasks: "已完成",
  stickyNotes: "便签",
  pomodoroLogs: "专注记录",
  countdowns: "倒数日",
  journal: "日记",
  config: "设置",
};

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  conflicts,
  onResolve,
  onClose,
}) => {
  const { t } = useTranslation();
  const s = t.settings as Record<string, string>;
  const [resolving, setResolving] = useState<"local" | "remote" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async (choice: "local" | "remote") => {
    setResolving(choice);
    setError(null);
    try {
      await onResolve(choice);
      onClose();
    } catch (err: any) {
      console.error("[SyncConflictModal] resolve failed:", err);
      setError(err?.message || String(err));
      setResolving(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fade-in p-4"
      onClick={resolving ? undefined : onClose}
    >
      <div
        className="bg-[#FCFBF7] dark:bg-[#1E1E1E] rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-[#EFEBE4] dark:border-[#333] space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>{s.syncConflictTitle || "云端数据有更新"}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-mono">
                {conflicts.length} 项冲突
              </span>
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              检测到其他设备提交了新的修改版本
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {s.syncConflictBody ||
            "以下数据在上次同步后被其他设备修改过，为避免覆盖，本次没有上传。云端版本已另存为本地备份。请选择保留哪一份："}
        </p>

        <div className="space-y-2.5 max-h-52 overflow-y-auto custom-scrollbar p-3 rounded-xl bg-white/70 dark:bg-[#282828] border border-[#EFEBE4] dark:border-[#3A3A3A]">
          {conflicts.map((c) => (
            <div
              key={c.category}
              className="space-y-1 pb-2.5 border-b border-[#EFEBE4] dark:border-[#333] last:border-b-0 last:pb-0"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px]">
                    {CATEGORY_NAMES[c.category] || c.category}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {c.fileName}
                  </span>
                </div>
                {c.remoteManifestVersion > 0 && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    版本: {c.remoteManifestVersion}
                  </span>
                )}
              </div>
              {c.backupPaths && c.backupPaths.length > 0 && (
                <div className="space-y-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 break-all pl-1">
                  {c.backupPaths.map((path, idx) => (
                    <div key={idx} className="truncate" title={path}>
                      备份: {path}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 break-all">
              {(s.syncConflictError || "解决冲突失败")}: {error}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#EFEBE4] dark:border-[#333]">
          <button
            type="button"
            onClick={onClose}
            disabled={resolving !== null}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2D2D2D] transition-colors cursor-pointer disabled:opacity-50"
          >
            {s.syncConflictDecideLater || "稍后决定"}
          </button>
          <button
            type="button"
            onClick={() => handleResolve("remote")}
            disabled={resolving !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100/70 hover:bg-amber-200/70 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800/80 disabled:opacity-50 cursor-pointer transition-all"
          >
            {resolving === "remote" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{s.syncConflictAcceptRemote || "使用云端版本（覆盖本机）"}</span>
          </button>
          <button
            type="button"
            onClick={() => handleResolve("local")}
            disabled={resolving !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#4D7C5D] hover:bg-[#3D644A] disabled:opacity-50 shadow-xs cursor-pointer transition-all"
          >
            {resolving === "local" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{s.syncConflictKeepLocal || "保留本机版本（覆盖云端）"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

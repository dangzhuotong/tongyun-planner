import React, { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { Sparkles, Download, AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";
import { downloadAndInstallAppUpdate } from "../utils/updater";

interface UpdateModalProps {
  update: Update;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ update, onClose }) => {
  const { t } = useTranslation();
  const s = t.settings;

  const [installing, setInstalling] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async () => {
    setInstalling(true);
    setError(null);
    try {
      await downloadAndInstallAppUpdate(update, (progress) => {
        if (progress.event === "Started" && progress.contentLength) {
          setTotalBytes(progress.contentLength);
        } else if (progress.event === "Progress" && progress.chunkLength) {
          setDownloadedBytes((prev) => prev + progress.chunkLength!);
        }
      });
    } catch (err: any) {
      console.error("[Updater] Install failed:", err);
      setError(err?.message || String(err));
      setInstalling(false);
    }
  };

  const percent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fade-in p-4"
      onClick={installing ? undefined : onClose}
    >
      <div
        className="bg-[#FCFBF7] dark:bg-[#1E1E1E] rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#EFEBE4] dark:border-[#333] space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#4D7C5D]/10 dark:bg-[#4D7C5D]/20 flex items-center justify-center text-[#4D7C5D] dark:text-[#6FAD84]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>{s.newVersionFound || "发现新版本"}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#4D7C5D] text-white font-mono">
                v{update.version}
              </span>
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {update.currentVersion ? `${s.currentVersion || "当前版本"}: v${update.currentVersion}` : ""}
              {update.date ? ` · ${update.date.slice(0, 10)}` : ""}
            </p>
          </div>
        </div>

        {update.body && (
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {s.releaseNotes || "更新日志"}
            </h4>
            <div className="max-h-48 overflow-y-auto custom-scrollbar p-3 rounded-xl bg-white/70 dark:bg-[#282828] border border-[#EFEBE4] dark:border-[#3A3A3A] text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {update.body}
            </div>
          </div>
        )}

        {installing && (
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-bold">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#4D7C5D]" />
                {s.updatingProgress || "正在下载并安装更新..."}
              </span>
              {percent !== null && <span>{percent}%</span>}
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#4D7C5D] dark:bg-[#6FAD84] rounded-full transition-all duration-200"
                style={{ width: percent !== null ? `${percent}%` : "100%" }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 break-all">
              {s.updateFailed || "更新失败："} {error}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#EFEBE4] dark:border-[#333]">
          {!installing && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2D2D2D] transition-colors cursor-pointer"
            >
              {s.updateLater || "稍后"}
            </button>
          )}
          <button
            onClick={handleUpdate}
            disabled={installing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#4D7C5D] hover:bg-[#3D644A] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all cursor-pointer"
          >
            {installing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{s.updatingProgress || "正在安装..."}</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>{s.updateNow || "立即更新并重启"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

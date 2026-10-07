import React from "react";
import { Cloud, ArrowRight } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import { clearLegacySyncBackend } from "../../utils/sync/legacyBackends";

interface LegacySyncNoticeProps {
  onClose: () => void;
  onGoSettings: () => void;
}

export const LegacySyncNotice: React.FC<LegacySyncNoticeProps> = ({ onClose, onGoSettings }) => {
  const { t } = useTranslation();
  const s = t.settings;

  const handleDismiss = () => {
    clearLegacySyncBackend();
    onClose();
  };

  const handleGoSettings = () => {
    clearLegacySyncBackend();
    onGoSettings();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fade-in p-4"
      onClick={handleDismiss}
    >
      <div
        className="bg-[#FCFBF7] dark:bg-[#1E1E1E] rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#EFEBE4] dark:border-[#333] space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#4D7C5D]/10 dark:bg-[#4D7C5D]/20 flex items-center justify-center text-[#4D7C5D] dark:text-[#6FAD84]">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              {s.legacySyncTitle || "同步方式已调整"}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              TongYun Planner v1.1.0
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
          {s.legacySyncBody || "从 v1.1.0 起，橦云手帐的云同步只支持 WebDAV（推荐坚果云）。你之前配置的 Supabase / 自建 HTTP 同步已停用，本机数据不受影响。请到「设置 → 数据同步」改用 WebDAV 继续多设备同步。"}
        </p>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#EFEBE4] dark:border-[#333]">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2D2D2D] transition-colors cursor-pointer"
          >
            {s.legacySyncAcknowledge || "知道了"}
          </button>
          <button
            onClick={handleGoSettings}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#4D7C5D] hover:bg-[#3D644A] shadow-sm transition-all cursor-pointer"
          >
            <span>{s.legacySyncGoSettings || "去设置"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

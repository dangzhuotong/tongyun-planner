import React, { useState } from "react";
import { Wand2, X } from "lucide-react";
import type { CustomizationConfig } from "../../types";
import { canUseAI, generatePraiseBatch } from "../../utils/aiEngine";
import { safeJsonParse } from "../../utils/json";
import { useTranslation } from "../../i18n/LanguageContext";

interface FunSettingsPanelProps {
  config: CustomizationConfig;
  onChange: (c: CustomizationConfig) => void;
}

export const FunSettingsPanel: React.FC<FunSettingsPanelProps> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const s = t.settings;

  const [aiPraiseList, setAiPraiseList] = useState<string[]>(() => {
    return safeJsonParse(localStorage.getItem("tongyun_ai_praise"), []);
  });
  const [generatingPraise, setGeneratingPraise] = useState(false);

  return (
    <div className="space-y-6 flex-grow overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
      <div className="bg-[#FAF8F5] border border-[#EFEBE4] rounded-2xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-700 block">{s.celebration || "🎉 夸夸模式"}</span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">{s.celebrationDesc || "完成任务时全屏撒花 + 夸赞消息"}</span>
        </div>
        <input
          type="checkbox"
          checked={config.enableCelebration !== false}
          onChange={(e) => onChange({ ...config, enableCelebration: e.target.checked })}
          className="w-4 h-4 accent-[#4D7C5D] cursor-pointer"
        />
      </div>

      {config.enableCelebration !== false && (
        <div className="bg-[#FAF8F5] border border-[#EFEBE4] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              AI 夸夸词库（{aiPraiseList.length} 条）
            </span>
            {canUseAI(config) && (
              <button
                onClick={async () => {
                  setGeneratingPraise(true);
                  try {
                    const msgs = await generatePraiseBatch(config, config.locale || "zh-CN", 5);
                    const existing = new Set(aiPraiseList);
                    const newOnes = msgs.filter((m) => !existing.has(m));
                    if (newOnes.length > 0) {
                      const updated = [...aiPraiseList, ...newOnes];
                      setAiPraiseList(updated);
                      localStorage.setItem("tongyun_ai_praise", JSON.stringify(updated));
                    }
                  } catch { /* ignore praise generation error */ }
                  setGeneratingPraise(false);
                }}
                disabled={generatingPraise}
                className="text-[10px] font-bold text-[#4D7C5D] hover:text-[#3F684C] flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#C4D7B2] hover:bg-[#F0F5F1] transition-all cursor-pointer disabled:opacity-50"
              >
                <Wand2 className={`w-3 h-3 ${generatingPraise ? "animate-spin" : ""}`} />
                {generatingPraise ? "生成中..." : "用 AI 生成 5 条夸夸"}
              </button>
            )}
          </div>
          {aiPraiseList.length > 0 ? (
            <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
              {aiPraiseList.map((msg, i) => (
                <div key={i} className="flex items-center justify-between bg-white border border-[#EFEBE4] rounded-lg px-3 py-1.5 group">
                  <span className="text-[11px] text-slate-700 font-medium truncate">{msg}</span>
                  <button
                    onClick={() => {
                      const updated = aiPraiseList.filter((_, j) => j !== i);
                      setAiPraiseList(updated);
                      localStorage.setItem("tongyun_ai_praise", JSON.stringify(updated));
                    }}
                    className="p-0.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer flex-shrink-0 ml-2"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-400 italic">
              {canUseAI(config) ? "点击上方按钮用 AI 生成夸夸词" : "配置 AI API Key 后可自动生成更多夸夸词"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { Sparkles, PenLine } from "lucide-react";
import type { Task, CustomizationConfig } from "../types";
import { useTranslation } from "../i18n/LanguageContext";
import { generateProse } from "../utils/aiEngine";
import { readDailyCache, writeDailyCache } from "../utils/dailyCache";
import { getLocalDateString } from "../utils/date";

interface ProseCardProps {
  config: CustomizationConfig;
  tasks: Task[];
}

const PROSE_CACHE_KEY = "tongyun_ai_daily_prose";

export const ProseCard: React.FC<ProseCardProps> = ({ config, tasks }) => {
  const { locale } = useTranslation();
  const isZh = locale === "zh-CN";
  const today = getLocalDateString();
  const localeKey = config.locale || "zh-CN";

  const [prose, setProse] = useState<string | null>(() =>
    readDailyCache<string>(PROSE_CACHE_KEY, today, localeKey)
  );
  const [proseLoading, setProseLoading] = useState(false);
  const [proseError, setProseError] = useState(false);

  const handleGenerateProse = async () => {
    if (!config.aiApiKey) {
      setProseError(true);
      return;
    }
    setProseLoading(true);
    setProseError(false);
    try {
      const contextHints = tasks
        .filter((t) => t.dueDate === today)
        .map((t) => t.title)
        .filter(Boolean)
        .slice(0, 3);
      const result = await generateProse(config, localeKey, {
        avoidSnippet: prose || undefined,
        contextHints,
      });
      if (result) {
        setProse(result);
        writeDailyCache(PROSE_CACHE_KEY, today, localeKey, result);
      } else {
        setProseError(true);
      }
    } catch {
      setProseError(true);
    }
    setProseLoading(false);
  };

  useEffect(() => {
    setProse(readDailyCache<string>(PROSE_CACHE_KEY, today, localeKey));
    setProseError(false);
  }, [today, localeKey]);

  const label = isZh ? "AI 散文" : "AI Prose";

  return (
    <div className="rounded-2xl bg-white/80 dark:bg-[#1C1D21]/90 border border-[#EFEBE4] dark:border-[#33353A] p-4.5 shadow-2xs">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-black text-[#8B6E3C] dark:text-[#C9A96A] tracking-widest uppercase flex items-center gap-1.5">
          <PenLine className="w-3.5 h-3.5" /> {label}
        </span>
        <button
          onClick={handleGenerateProse}
          disabled={proseLoading}
          className={`text-[9px] font-black flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            proseLoading
              ? "bg-slate-100 dark:bg-[#282A30] text-slate-400 cursor-not-allowed"
              : "bg-[#4D7C5D]/10 dark:bg-[#232924] text-[#4D7C5D] dark:text-[#6FAD84] hover:bg-[#4D7C5D]/20 hover:scale-105"
          }`}
        >
          <Sparkles className={`w-3 h-3 ${proseLoading ? "animate-spin" : ""}`} />
          {proseLoading
            ? (isZh ? "生成中..." : "Generating...")
            : prose
              ? (isZh ? "换一篇" : "Another one")
              : (isZh ? "生成散文" : "Generate")}
        </button>
      </div>
      <div className="min-h-[60px]">
        {proseLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-[#4D7C5D]/30 border-t-[#4D7C5D] rounded-full animate-spin" />
          </div>
        ) : proseError ? (
          <p className="text-[10px] text-red-400 font-bold text-center py-4">
            {isZh ? "生成失败，请检查 AI 配置" : "Failed to generate. Check AI settings."}
          </p>
        ) : prose ? (
          (() => {
            const titleMatch = prose.match(/^(.+?)\n\n([\s\S]*)$/);
            const proseTitle = titleMatch?.[1]?.trim() ?? null;
            const proseBody = titleMatch?.[2] ?? prose;
            return (
              <>
                {proseTitle && (
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 tracking-wide leading-snug">
                    {proseTitle}
                  </h4>
                )}
                <div className="prose-body space-y-3">
                  {proseBody.split(/\n{2,}/).map((paragraph, idx, arr) => {
                    const trimmed = paragraph.replace(/\n/g, "").trim();
                    if (!trimmed) return null;
                    const isFirst = idx === 0 && !proseTitle;
                    return (
                      <div key={idx} className="relative">
                        {arr.length > 1 && idx > 0 && (
                          <div className="flex items-center gap-2 my-2.5 opacity-30">
                            <span className="h-px flex-grow bg-[#DEEAE2] dark:bg-[#33353A]" />
                            <span className="text-[#B8D4C1] text-[6px]">✦</span>
                            <span className="h-px flex-grow bg-[#DEEAE2] dark:bg-[#33353A]" />
                          </div>
                        )}
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-[1.9] tracking-wide font-medium">
                          {isFirst && (
                            <span className="float-left text-[2.6em] leading-[0.85] font-bold text-[#4D7C5D] dark:text-[#6FAD84] mr-2 mt-0.5 font-serif">
                              {trimmed.charAt(0)}
                            </span>
                          )}
                          {isFirst ? trimmed.slice(1) : trimmed}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()
        ) : (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold text-center py-4">
            {isZh ? "点击上方按钮，让 AI 为你写一篇短随笔" : "Click above to let AI write a short essay for you"}
          </p>
        )}
      </div>
    </div>
  );
};

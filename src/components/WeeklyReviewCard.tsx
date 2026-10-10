import React, { useState, useMemo } from "react";
import { Sparkles, TrendingUp, Clock, BookOpen, CheckCircle2 } from "lucide-react";
import type { Task, PomodoroLog, JournalEntry, CustomizationConfig } from "../types";
import { useTranslation } from "../i18n/LanguageContext";
import { canUseAI, generateWeeklyReview, type WeeklyReviewContext } from "../utils/aiEngine";
import { readDailyCache, writeDailyCache } from "../utils/dailyCache";
import { getLocalDateString } from "../utils/date";

interface WeeklyReviewCardProps {
  config: CustomizationConfig;
  completedTasks: Task[];
  pomodoroLogs: PomodoroLog[];
  journal: JournalEntry[];
}

const CACHE_KEY = "tongyun_ai_weekly_review";

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

const WeeklyReviewCardInner: React.FC<WeeklyReviewCardProps & { today: string; localeKey: string }> = ({
  config,
  completedTasks,
  pomodoroLogs,
  journal,
  today,
  localeKey,
}) => {
  const { locale } = useTranslation();
  const isZh = locale === "zh-CN";
  const { start, end } = getWeekRange();

  const [review, setReview] = useState<string | null>(() =>
    readDailyCache<string>(CACHE_KEY, today, localeKey)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const stats = useMemo(() => {
    const weekCompleted = completedTasks.filter((t) => {
      if (!t.completedAt) return false;
      const d = new Date(t.completedAt).toISOString().slice(0, 10);
      return d >= start && d <= end;
    });
    const weekPomodoros = pomodoroLogs.filter((p) => {
      const d = new Date(p.timestamp).toISOString().slice(0, 10);
      return d >= start && d <= end;
    });
    const weekJournals = journal.filter((j) => {
      if (!j.date) return false;
      return j.date >= start && j.date <= end;
    });

    const moodCounts: Record<string, number> = {};
    weekJournals.forEach((j) => {
      if (j.mood) moodCounts[j.mood] = (moodCounts[j.mood] || 0) + 1;
    });
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
    const moodSummary = topMood ? `${topMood[0]} ×${topMood[1]}` : "";

    return {
      completedCount: weekCompleted.length,
      pomodoroCount: weekPomodoros.length,
      pomodoroMinutes: Math.round(weekPomodoros.reduce((s, p) => s + p.duration, 0) / 60),
      journalDays: weekJournals.length,
      journalSnippets: weekJournals
        .filter((j) => j.content)
        .map((j) => (j.content || "").slice(0, 60).trim())
        .filter(Boolean),
      moodSummary,
    };
  }, [completedTasks, pomodoroLogs, journal, start, end]);

  const handleGenerate = async () => {
    if (!canUseAI(config)) {
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const ctx: WeeklyReviewContext = {
        completedCount: stats.completedCount,
        pomodoroCount: stats.pomodoroCount,
        pomodoroMinutes: stats.pomodoroMinutes,
        journalDays: stats.journalDays,
        journalSnippets: stats.journalSnippets.slice(0, 5),
        moodSummary: stats.moodSummary,
      };
      const result = await generateWeeklyReview(config, localeKey, ctx);
      if (result) {
        setReview(result);
        writeDailyCache(CACHE_KEY, today, localeKey, result);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl bg-white/80 dark:bg-[#1C1D21]/90 border border-[#EFEBE4] dark:border-[#33353A] p-4.5 shadow-2xs">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-black text-[#8B6E3C] dark:text-[#C9A96A] tracking-widest uppercase flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          {isZh ? "本周回顾" : "Weekly Review"}
        </span>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className={`text-[9px] font-black flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            loading
              ? "bg-slate-100 dark:bg-[#282A30] text-slate-400 cursor-not-allowed"
              : "bg-[#8B6E3C]/10 dark:bg-[#33301E] text-[#8B6E3C] dark:text-[#C9A96A] hover:bg-[#8B6E3C]/20 hover:scale-105"
          }`}
        >
          <Sparkles className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading
            ? (isZh ? "生成中..." : "Generating...")
            : review
              ? (isZh ? "刷新" : "Refresh")
              : (isZh ? "生成回顾" : "Generate")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-xl bg-[#F0F5F1] dark:bg-[#232924] p-2.5 text-center">
          <CheckCircle2 className="w-3.5 h-3.5 mx-auto mb-1 text-[#4D7C5D] dark:text-[#6FAD84]" />
          <div className="text-sm font-black text-[#3F684C] dark:text-[#6FAD84]">{stats.completedCount}</div>
          <div className="text-[8px] text-slate-500 dark:text-slate-400 font-bold uppercase">
            {isZh ? "已完成" : "Done"}
          </div>
        </div>
        <div className="rounded-xl bg-[#F5F0EB] dark:bg-[#2A2A20] p-2.5 text-center">
          <Clock className="w-3.5 h-3.5 mx-auto mb-1 text-[#8B6E3C] dark:text-[#C9A96A]" />
          <div className="text-sm font-black text-[#6B5530] dark:text-[#C9A96A]">{stats.pomodoroMinutes}</div>
          <div className="text-[8px] text-slate-500 dark:text-slate-400 font-bold uppercase">
            {isZh ? "专注分" : "min"}
          </div>
        </div>
        <div className="rounded-xl bg-[#F0F4F7] dark:bg-[#1E242B] p-2.5 text-center">
          <BookOpen className="w-3.5 h-3.5 mx-auto mb-1 text-[#4D6C8B] dark:text-[#7CA2C4]" />
          <div className="text-sm font-black text-[#3A5873] dark:text-[#7CA2C4]">{stats.journalDays}</div>
          <div className="text-[8px] text-slate-500 dark:text-slate-400 font-bold uppercase">
            {isZh ? "日记篇" : "journal"}
          </div>
        </div>
      </div>

      <div className="min-h-[40px]">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-[#8B6E3C]/30 border-t-[#8B6E3C] rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-[10px] text-red-400 font-bold text-center py-3">
            {isZh ? "生成失败，请检查 AI 配置" : "Failed to generate. Check AI config."}
          </p>
        ) : review ? (
          <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-[1.8] tracking-wide font-medium text-center px-1">
            {review}
          </p>
        ) : (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold text-center py-3">
            {isZh ? "点击上方按钮，生成你的本周回顾" : "Click above to generate your weekly review"}
          </p>
        )}
      </div>
    </div>
  );
};

export const WeeklyReviewCard: React.FC<WeeklyReviewCardProps> = (props) => {
  const today = getLocalDateString();
  const localeKey = props.config.locale || "zh-CN";
  return <WeeklyReviewCardInner key={`${today}-${localeKey}`} today={today} localeKey={localeKey} {...props} />;
};

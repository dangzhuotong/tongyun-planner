import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageContext";
import { Sparkles, History, Circle, CheckCircle2, ListTodo, CloudSun, CalendarDays, Award, Clock, PenLine, TrendingUp, RefreshCw } from "lucide-react";
import type { Task, CustomizationConfig } from "../types";
import { getLocalDateString } from "../utils/date";
import { generateProse, generateDailySuggestion } from "../utils/aiEngine";
import { safeJsonParse } from "../utils/json";


// ============ 每日缓存工具 ============
// 用 localStorage 做当天缓存，进 Dashboard 只在\"今天还没生成过\"时才调 AI。
// 跨天自动过期。
interface DailyCache<T> {
  date: string;    // YYYY-MM-DD
  locale?: string; // 语言切换要重新生成
  data: T;
}
function readDailyCache<T>(key: string, today: string, locale: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = safeJsonParse<DailyCache<T> | null>(raw, null);
  if (!parsed) return null;
  if (parsed.date !== today) return null;
  if (parsed.locale && parsed.locale !== locale) return null;
  return parsed.data;
}
function writeDailyCache<T>(key: string, today: string, locale: string, data: T) {
  const payload: DailyCache<T> = { date: today, locale, data };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // 忽略配额错误
  }
}

interface DashboardViewProps {
  tasks: Task[];
  completedTasks: Task[];
  handleComplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  config: CustomizationConfig;
}

export const DashboardView: React.FC<DashboardViewProps> = React.memo(({
  tasks,
  completedTasks,
  handleComplete,
  onTaskClick,
  config,
}) => {
  const { t } = useTranslation();
  const d = t.dashboard;

  const [nickname] = useState(() => localStorage.getItem("tongyun_nickname") || "");
  const today = getLocalDateString();
  const localeKey = config.locale || "zh-CN";

  const hour = new Date().getHours();
  let greetKey: string;
  let greetEmoji: string;
  let greetGradientClass: string;
  
  if (hour >= 5 && hour < 12) {
    greetKey = "morning";
    greetEmoji = "🌤️";
    greetGradientClass = "gradient-text-morning";
  } else if (hour >= 12 && hour < 14) {
    greetKey = "noon";
    greetEmoji = "☀️";
    greetGradientClass = "gradient-text-noon";
  } else if (hour >= 14 && hour < 18) {
    greetKey = "afternoon";
    greetEmoji = "🌤️";
    greetGradientClass = "gradient-text-afternoon";
  } else {
    greetKey = "evening";
    greetEmoji = "🌙";
    greetGradientClass = "gradient-text-evening";
  }

  const greeting = `${d[greetKey]}${nickname ? `, ${nickname}` : ""}!`;

  const todayTasks = useMemo(() => tasks.filter((t) => t.dueDate === today), [tasks, today]);
  const totalCount = tasks.length + completedTasks.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((completedTasks.length / totalCount) * 100);

  // Weather
  const [weather, setWeather] = useState<{
    temp: number;
    icon: string;
    city: string;
    weather: string;
    alerts: { title: string; level: string }[];
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    const city = config.weatherCity?.trim();
    if (!city) return;
    setWeatherLoading(true);
    (async () => {
      try {
        const res = await fetch(`https://uapis.cn/api/v1/misc/weather?city=${encodeURIComponent(city)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setWeather({
          temp: data?.temperature ?? 0,
          icon: data?.weather_icon ?? "",
          city: data?.city ?? city,
          weather: data?.weather ?? "",
          alerts: data?.alerts ?? [],
        });
      } catch {
        // weather unavailable
      }
      setWeatherLoading(false);
    })();
  }, [config.weatherCity]);

  // Quote —— 每小时缓存一次;点"换一句"强制刷新
  // 一言不是每天固定,但也不需要每次进入都调,按小时为粒度平衡新鲜感与请求次数
  type HitokotoData = { text: string; from: string };
  const HITOKOTO_CACHE_KEY = "tongyun_hitokoto_hourly";
  const currentHourKey = `${today}-${new Date().getHours()}`;
  const [hitokoto, setHitokoto] = useState<HitokotoData | null>(() =>
    readDailyCache<HitokotoData>(HITOKOTO_CACHE_KEY, currentHourKey, localeKey)
  );
  const [loadingHitokoto, setLoadingHitokoto] = useState(false);

  const fetchHitokoto = async (force: boolean = false) => {
    if (!force) {
      const cached = readDailyCache<HitokotoData>(HITOKOTO_CACHE_KEY, currentHourKey, localeKey);
      if (cached) {
        setHitokoto(cached);
        return;
      }
    }
    setLoadingHitokoto(true);
    try {
      const res = await fetch("https://v1.hitokoto.cn/");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const next: HitokotoData = {
        text: data?.hitokoto ?? d.quoteFallback,
        from: data?.from_who ? `${data.from_who} · ${data?.from ?? ""}` : (data?.from ?? ""),
      };
      setHitokoto(next);
      writeDailyCache(HITOKOTO_CACHE_KEY, currentHourKey, localeKey, next);
    } catch {
      setHitokoto({ text: d.quoteFallback, from: "" });
    }
    setLoadingHitokoto(false);
  };

  // History —— 当日缓存,历史上的今天一天内根本不会变
  const HISTORY_CACHE_KEY = "tongyun_history_today";
  const [historyEvents, setHistoryEvents] = useState<string[]>(() =>
    readDailyCache<string[]>(HISTORY_CACHE_KEY, today, localeKey) || []
  );
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async (force: boolean = false) => {
    if (!force) {
      const cached = readDailyCache<string[]>(HISTORY_CACHE_KEY, today, localeKey);
      if (cached && cached.length > 0) {
        setHistoryEvents(cached);
        return;
      }
    }
    setLoadingHistory(true);
    try {
      const res = await fetch("https://v1.nsuuu.com/api/history");
      const data = await res.json();
      if (data.code === 200 && Array.isArray(data.data)) {
        const events = data.data.slice(0, 10);
        setHistoryEvents(events);
        writeDailyCache(HISTORY_CACHE_KEY, today, localeKey, events);
      } else {
        setHistoryEvents([]);
      }
    } catch {
      setHistoryEvents([]);
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    // 有缓存的走 fetchXxx(false) 直接命中;没有才发请求
    fetchHitokoto(false);
    fetchHistory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, currentHourKey, localeKey]);

  // AI Daily Suggestion —— 当日缓存,只在跨天/语言变化时重新生成
  const SUGGESTION_CACHE_KEY = "tongyun_ai_daily_suggestion";
  const [dailySuggestion, setDailySuggestion] = useState<string | null>(() =>
    readDailyCache<string>(SUGGESTION_CACHE_KEY, today, localeKey)
  );
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const generateSuggestion = async (force: boolean = false) => {
    if (!config.aiApiKey) return;
    if (!force) {
      const cached = readDailyCache<string>(SUGGESTION_CACHE_KEY, today, localeKey);
      if (cached) {
        setDailySuggestion(cached);
        return;
      }
    }
    setSuggestionLoading(true);
    try {
      const todayTasksBrief = tasks
        .filter((t) => t.dueDate === today)
        .map((t) => ({ title: t.title, category: t.category, dueTime: t.dueTime, description: t.description }));
      const result = await generateDailySuggestion(config, todayTasksBrief, localeKey);
      if (result) {
        setDailySuggestion(result);
        writeDailyCache(SUGGESTION_CACHE_KEY, today, localeKey, result);
      }
    } finally {
      setSuggestionLoading(false);
    }
  };

  useEffect(() => {
    if (!config.aiApiKey) return;
    // 优先用缓存;跨天/切语言/未生成过时才调 API
    const cached = readDailyCache<string>(SUGGESTION_CACHE_KEY, today, localeKey);
    if (cached) {
      setDailySuggestion(cached);
      return;
    }
    generateSuggestion(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.aiApiKey, today, localeKey]);

  // Prose —— 同样当日缓存,进入 Dashboard 自动生成一次,支持手动重新生成
  const PROSE_CACHE_KEY = "tongyun_ai_daily_prose";
  const [prose, setProse] = useState<string | null>(() =>
    readDailyCache<string>(PROSE_CACHE_KEY, today, localeKey)
  );
  const [proseLoading, setProseLoading] = useState(false);
  const [proseError, setProseError] = useState(false);

  const handleGenerateProse = async (force: boolean = false) => {
    if (!config.aiApiKey) {
      setProseError(true);
      return;
    }
    if (!force) {
      const cached = readDailyCache<string>(PROSE_CACHE_KEY, today, localeKey);
      if (cached) {
        setProse(cached);
        return;
      }
    }
    setProseLoading(true);
    setProseError(false);
    try {
      const result = await generateProse(config, localeKey);
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

  // 进入 Dashboard 自动生成一次(有缓存直接用,不发请求)
  useEffect(() => {
    if (!config.aiApiKey) return;
    const cached = readDailyCache<string>(PROSE_CACHE_KEY, today, localeKey);
    if (cached) {
      setProse(cached);
      return;
    }
    handleGenerateProse(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.aiApiKey, today, localeKey]);

  // Format local date elegantly
  const localDateStr = new Date().toLocaleDateString(
    config.locale === "en" ? "en-US" : "zh-CN",
    {
      month: "short",
      day: "numeric",
      weekday: "long",
    }
  );

  // Year progress
  const nowYear = new Date().getFullYear();
  const yearStart = new Date(nowYear, 0, 1);
  const yearEnd = new Date(nowYear + 1, 0, 1);
  const yearPct = Math.round(((Date.now() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime())) * 100);

  // SVG circular progress parameters
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  return (
    <div className="animate-fade-in-up flex flex-col gap-5 flex-grow z-10 relative select-none max-w-3xl mx-auto w-full pt-2">
      
      {/* 问候与天气头部模块 */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white/80 border border-[#EFEBE4]/80 p-5 rounded-3xl shadow-xs ">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{greetEmoji}</span>
            <h1 className={`text-2xl font-black tracking-tight ${greetGradientClass}`}>
              {greeting}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <CalendarDays className="w-3.5 h-3.5 text-[#8B6E3C]" />
            <span>{localDateStr}</span>
            <span className="text-[#EFEBE4]">|</span>
            <span className="text-[#8B6E3C] font-semibold">{d.cheerfulDay} ✨</span>
          </div>
        </div>

        {/* Weather Box */}
        {weatherLoading ? (
          <div className="text-[11px] text-slate-400 font-bold animate-pulse bg-white/70 px-4 py-2.5 rounded-full border border-[#EFEBE4]">
            {d.loading}
          </div>
        ) : weather ? (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 bg-white/80 border border-[#EFEBE4] px-4 py-2 rounded-2xl shadow-2xs">
              <CloudSun className="w-4 h-4 text-[#8B6E3C] animate-pulse-soft" />
              <span className="text-sm font-bold text-[#8B6E3C]">{weather.temp}°C</span>
              <span className="text-xs text-slate-500 font-semibold">{weather.weather}</span>
              <span className="text-[10px] text-slate-400 font-bold bg-[#FAF8F5] px-1.5 py-0.5 rounded">{weather.city}</span>
            </div>
            {weather.alerts.length > 0 && (
              <div className="text-[9px] text-red-500 font-black bg-red-50/80 px-3 py-1 rounded-full border border-red-100 max-w-[200px] truncate">
                ⚠ {weather.alerts[0].title}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* 独立精致的 4 个统计小卡片 */}
      <div className="grid grid-cols-4 gap-4">
        {/* 卡片 1: 待办任务 */}
        <div className="stat-card-todo rounded-2xl border border-[#EFEBE4] p-3.5 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.sidebar.remaining}</span>
            <div className="text-xl font-black text-slate-800 animate-count-up">{tasks.length}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white border border-[#EFEBE4] flex items-center justify-center shadow-3xs">
            <ListTodo className="w-4.5 h-4.5 text-[#5B99B0]" />
          </div>
        </div>

        {/* 卡片 2: 已完成任务 */}
        <div className="stat-card-done rounded-2xl border border-[#EFEBE4] p-3.5 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.sidebar.completed}</span>
            <div className="text-xl font-black text-slate-800 animate-count-up">{completedTasks.length}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white border border-[#EFEBE4] flex items-center justify-center shadow-3xs">
            <Award className="w-4.5 h-4.5 text-[#4D7C5D]" />
          </div>
        </div>

        {/* 卡片 3: 今日进度率 */}
        <div className="stat-card-rate rounded-2xl border border-[#EFEBE4] p-3.5 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.sidebar.progress}</span>
            <div className="text-xl font-black text-slate-800 animate-count-up">{progressPct}%</div>
          </div>
          
          {/* Circular Progress Ring */}
          <div className="relative w-9 h-9 flex items-center justify-center">
            <svg className="progress-ring w-9 h-9">
              {/* Background circle */}
              <circle
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="transparent"
                r={radius}
                cx="18"
                cy="18"
              />
              {/* Progress circle */}
              <circle
                className="progress-ring-circle text-[#E8A0BF]"
                strokeWidth="3.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r={radius}
                cx="18"
                cy="18"
              />
            </svg>
          </div>
        </div>

        {/* 卡片 4: 年度进度 */}
        <div className="rounded-2xl border border-[#EFEBE4] p-3.5 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-between bg-white/40">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{nowYear}</span>
            <div className="text-xl font-black text-slate-800 animate-count-up">{yearPct}%</div>
          </div>
          <div className="relative w-9 h-9 flex items-center justify-center">
            <svg className="w-9 h-9" viewBox="0 0 36 36">
              <circle className="text-slate-100" strokeWidth="3.5" stroke="currentColor" fill="transparent" r={radius} cx="18" cy="18" />
              <circle
                className="text-[#B2C8DF]"
                strokeWidth="3.5"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (yearPct / 100) * circumference}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r={radius}
                cx="18"
                cy="18"
                transform="rotate(-90 18 18)"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* 本周回顾 */}
      {(() => {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekCompleted = completedTasks.filter((t) => {
          if (!t.dueDate) return false;
          const d = new Date(t.dueDate);
          return d >= weekAgo && d <= now;
        });
        const weekCompletedCount = weekCompleted.length;
        const todayCount = completedTasks.filter((t) => t.dueDate === today).length;
        if (weekCompletedCount === 0) return null;
        return (
          <div className="rounded-2xl bg-gradient-to-r from-[#FAF5ED] to-[#FFF9F5] border border-[#EFE5D3] p-3.5 flex items-center gap-3 shadow-2xs">
            <TrendingUp className="w-5 h-5 text-[#8B6E3C]" />
            <div className="flex-grow">
              <span className="text-[10px] font-bold text-[#8B6E3C] tracking-wide">
                本周回顾
              </span>
              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                本周已完成 {weekCompletedCount} 项任务{todayCount > 0 ? `，今天已完成 ${todayCount} 项` : ""}
              </p>
            </div>
            <span className="text-lg">📊</span>
          </div>
        );
      })()}

      {/* Quote + History in 2-column on wide screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quote */}
        <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-4.5 shadow-2xs hover:shadow-xs card-hover-lift flex flex-col justify-between min-h-[150px]">
          <div className="quote-decoration space-y-2">
            {hitokoto ? (
              <>
                <p className="text-xs text-slate-700 leading-relaxed font-bold tracking-wide italic">
                  {hitokoto.text}
                </p>
                {hitokoto.from && (
                  <p className="text-[9px] text-[#8B6E3C] font-black tracking-wider text-right pr-2">
                    —— {hitokoto.from}
                  </p>
                )}
              </>
            ) : (
              <span className="text-[10px] text-slate-400 font-bold">{loadingHitokoto ? d.loading : ""}</span>
            )}
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-100/60 mt-2">
            <span className="text-[8px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#4D7C5D]" /> Daily Inspiration
            </span>
            <button onClick={() => fetchHitokoto(true)} className="text-[9px] font-black text-[#4D7C5D] hover:underline cursor-pointer">
              换一句
            </button>
          </div>
        </div>

        {/* History */}
        <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-3.5 shadow-2xs hover:shadow-xs card-hover-lift flex flex-col justify-between min-h-[130px]">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 border-b border-slate-100/60 pb-1 mb-1">
              <History className="w-3 h-3 text-[#8B6E3C]" />
              <h3 className="text-[9px] font-black text-[#8B6E3C] tracking-widest uppercase">
                {d.todayInHistory}
              </h3>
            </div>
            
            {/* Scrollable list box */}
            <div className="space-y-2 max-h-[80px] overflow-y-auto scrollable-card pr-1">
              {historyEvents.length > 0 ? (
                historyEvents.map((evt, idx) => {
                  const match = evt.match(/^(\d{4})年/);
                  const year = match ? match[1] : "";
                  const text = match ? evt.slice(match[0].length) : evt;
                  return (
                    <div key={`evt-${year}-${idx}`} className="timeline-dot flex items-start gap-2">
                      {year && (
                        <span className="text-[7px] font-black text-[#4D7C5D] bg-[#F0F5F1] px-1 py-0.5 rounded shrink-0">
                          {year}
                        </span>
                      )}
                      <span className="text-[9px] text-slate-600 font-bold leading-relaxed">
                        {text}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-[9px] text-slate-400 font-black text-center py-3">
                  {loadingHistory ? d.loading : d.noEvents}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-0.5">
            <span className="text-[7px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5 text-[#8B6E3C]" /> Timeline
            </span>
          </div>
        </div>
      </div>



      {/* AI 每日建议 —— 当日缓存，进入即用；右上角提供手动重新生成 */}
      {config.aiApiKey && (dailySuggestion || suggestionLoading) && (
        <div className="rounded-2xl bg-gradient-to-r from-[#F0F5F1] to-[#EBF3F6] border border-[#DEEAE2] p-4.5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#4D7C5D]" />
              <span className="text-[9px] font-black text-[#4D7C5D] tracking-widest uppercase">AI 今日建议</span>
            </div>
            <button
              onClick={() => generateSuggestion(true)}
              disabled={suggestionLoading}
              className={`text-[9px] font-black flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                suggestionLoading
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-white/60 text-[#4D7C5D] hover:bg-white hover:scale-105 border border-[#DEEAE2]"
              }`}
              title="重新生成今日建议"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${suggestionLoading ? "animate-spin" : ""}`} />
              换一条
            </button>
          </div>
          {suggestionLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#4D7C5D]/30 border-t-[#4D7C5D] rounded-full animate-spin" />
              <span className="text-[10px] text-slate-400 font-medium">为你思考今日计划...</span>
            </div>
          ) : (
            <p className="text-[11px] text-slate-700 leading-relaxed font-medium">{dailySuggestion}</p>
          )}
        </div>
      )}

      {/* AI Prose */}
      <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-4.5 shadow-2xs hover:shadow-xs card-hover-lift ">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] font-black text-[#8B6E3C] tracking-widest uppercase flex items-center gap-1.5">
            <PenLine className="w-3.5 h-3.5" /> {t.prose?.title || "AI 散文"}
          </span>
          <button
            onClick={() => handleGenerateProse(true)}
            disabled={proseLoading}
            className={`text-[9px] font-black flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              proseLoading
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-[#4D7C5D]/10 text-[#4D7C5D] hover:bg-[#4D7C5D]/20 hover:scale-105"
            }`}
          >
            <Sparkles className={`w-3 h-3 ${proseLoading ? "animate-spin" : ""}`} />
            {proseLoading ? (t.prose?.generating || "生成中...") : (t.prose?.generate || "生成散文")}
          </button>
        </div>
        <div className="min-h-[60px]">
          {proseLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-[#4D7C5D]/30 border-t-[#4D7C5D] rounded-full animate-spin" />
            </div>
          ) : proseError ? (
            <p className="text-[10px] text-red-400 font-bold text-center py-4">{t.prose?.error || "生成失败，请检查 AI 配置"}</p>
          ) : prose ? (
            (() => {
              const titleMatch = prose.match(/^(.+?)\n\n([\s\S]*)$/);
              const proseTitle = titleMatch?.[1]?.trim() ?? null;
              const proseBody = titleMatch?.[2] ?? prose;
              return (
                <>
                  {proseTitle && (
                    <h4 className="text-sm font-bold text-slate-800 mb-3 tracking-wide leading-snug">
                      {proseTitle}
                    </h4>
                  )}
                  <div className="prose-body space-y-3">
                    {proseBody.split(/\n{2,}/).map((paragraph, idx, arr) => {
                      const trimmed = paragraph.replace(/\n/g, "").trim();
                      if (!trimmed) return null;
                      const isFirst = idx === 0 && !proseTitle;
                      return (
                        <div key={`prose-${idx}`} className="relative">
                          {arr.length > 1 && idx > 0 && (
                            <div className="flex items-center gap-2 my-2.5 opacity-30">
                              <span className="h-px flex-grow bg-[#DEEAE2]" />
                              <span className="text-[#B8D4C1] text-[6px]">✦</span>
                              <span className="h-px flex-grow bg-[#DEEAE2]" />
                            </div>
                          )}
                          <p className="text-[11px] text-slate-700 leading-[1.9] tracking-wide font-medium">
                            {isFirst && (
                              <span className="float-left text-[2.6em] leading-[0.85] font-bold text-[#4D7C5D] mr-2 mt-0.5 font-serif">
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
            <p className="text-[10px] text-slate-400 font-bold text-center py-4">
              {t.prose?.empty || "点击上方按钮，让 AI 为你写一篇散文 ✨"}
            </p>
          )}
        </div>
      </div>

      {/* Today's Tasks */}
      <div className="rounded-3xl bg-white/90 border border-[#EFEBE4] shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#EFEBE4]/60 flex items-center justify-between">
          <h3 className="text-xs font-black text-[#8B6E3C] tracking-wider flex items-center gap-1.5 uppercase">
            <ListTodo className="w-4 h-4" />
            {d.todayTasks}
          </h3>
          <span className="text-[9px] text-[#8B6E3C] font-black bg-[#FAF8F5] border border-[#EFEBE4]/60 px-2.5 py-0.5 rounded-full">
            {todayTasks.length} / {tasks.length}
          </span>
        </div>
        <div className="p-3">
          {todayTasks.length > 0 ? (
            <div className="space-y-1.5">
              {todayTasks.map((task) => {
                // Determine priority bar color from category
                const priorityBarClass = `task-bar-${task.category || "urgent-important"}`;
                
                // Get quad number label
                let quadLabel = "I";
                let quadColor = "text-[#E8A0BF] bg-[#FCF2F0] border-[#F5DFDB]";
                if (task.category === "important-not-urgent") {
                  quadLabel = "II";
                  quadColor = "text-[#4D7C5D] bg-[#F0F5F1] border-[#DEEAE2]";
                } else if (task.category === "urgent-not-important") {
                  quadLabel = "III";
                  quadColor = "text-[#5B99B0] bg-[#EEF5F8] border-[#C5DEE8]";
                } else if (task.category === "not-urgent-not-important") {
                  quadLabel = "IV";
                  quadColor = "text-[#A08B30] bg-[#FBF8EC] border-[#EDE5C8]";
                }

                return (
                  <div
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/80 border border-[#EFEBE4]/40 hover:border-[#EFEBE4]/90 hover:bg-white hover:-translate-x-1 hover:shadow-2xs transition-all duration-300 cursor-pointer group ${priorityBarClass}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleComplete(task.id);
                      }}
                      className="shrink-0 text-slate-300 hover:text-[#4D7C5D] transition-colors cursor-pointer"
                      title={d.completed_task}
                    >
                      <Circle className="w-4 h-4 group-hover:hidden" />
                      <CheckCircle2 className="w-4 h-4 hidden group-hover:block text-[#4D7C5D]" />
                    </button>
                    
                    {/* Priority badge indicator */}
                    <span className={`text-[8px] font-black border px-1.5 py-0.5 rounded-md ${quadColor} shrink-0`}>
                      {quadLabel}
                    </span>

                    <div className="flex-grow min-w-0">
                      <p className="text-xs font-bold text-[#2D323A] truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-[9px] text-slate-400 font-semibold truncate mt-0.5">{task.description}</p>
                      )}
                    </div>

                    <span className="text-[8.5px] text-slate-400 font-black bg-[#FAF8F5] border border-[#EFEBE4]/60 px-2 py-0.5 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.dueToday}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 space-y-2">
              <span className="text-3xl block filter saturate-50 animate-pulse-soft">🍃</span>
              <p className="text-xs text-slate-400 font-bold">{d.noTasksToday}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});


import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageContext";
import { Sparkles, History, Circle, CheckCircle2, ListTodo, CloudSun, CalendarDays, Clock, TrendingUp, RefreshCw, BookOpen, Timer } from "lucide-react";
import type { Task, CustomizationConfig, PomodoroLog } from "../types";
import { getLocalDateString, filterHomeActionableTasks, getHomeTaskKind } from "../utils/date";
import { generateDailySuggestion, getEffectiveApiKey } from "../utils/aiEngine";
import { readDailyCache, writeDailyCache } from "../utils/dailyCache";
import { usePersonal } from "../context/PersonalContext";
import { computeDailyReview } from "../utils/dailyReview";
import { HabitCard } from "./HabitCard";
import { ProseCard } from "./ProseCard";
import type { HabitItem } from "../types";

interface HabitsHookLike {
  habits: HabitItem[];
  addHabit: (name: string, emoji: string) => void;
  removeHabit: (id: string) => void;
  toggleHabit: (id: string) => void;
}

interface DashboardViewProps {
  tasks: Task[];
  completedTasks: Task[];
  pomodoroLogs: PomodoroLog[];
  handleComplete: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onOpenJournal?: () => void;
  config: CustomizationConfig;
  habitsHook: HabitsHookLike;
}

export const DashboardView: React.FC<DashboardViewProps> = React.memo(({
  tasks,
  completedTasks,
  pomodoroLogs,
  handleComplete,
  onTaskClick,
  onOpenJournal,
  config,
  habitsHook,
}) => {
  const { t } = useTranslation();
  const d = t.dashboard;
  const { journal } = usePersonal();

  const [nickname] = useState(() => localStorage.getItem("tongyun_nickname") || "");
  const today = getLocalDateString();
  const localeKey = config.locale || "zh-CN";

  const review = useMemo(
    () =>
      computeDailyReview({
        date: today,
        tasks,
        completedTasks,
        pomodoroLogs,
        journal,
      }),
    [today, tasks, completedTasks, pomodoroLogs, journal]
  );

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

  const todayTasks = useMemo(() => filterHomeActionableTasks(tasks, today), [tasks, today]);

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
  const [suggestionError, setSuggestionError] = useState(false);

  const generateSuggestion = async (force: boolean = false) => {
    if (!getEffectiveApiKey(config)) return;
    if (!force) {
      const cached = readDailyCache<string>(SUGGESTION_CACHE_KEY, today, localeKey);
      if (cached) {
        setDailySuggestion(cached);
        setSuggestionError(false);
        return;
      }
    }
    setSuggestionLoading(true);
    setSuggestionError(false);
    try {
      const todayTasksBrief = tasks
        .filter((t) => t.dueDate === today)
        .map((t) => ({ title: t.title, category: t.category, dueTime: t.dueTime, description: t.description }));
      const dayStart = new Date(today + "T00:00:00").getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const todayPomos = pomodoroLogs.filter((l) => l.timestamp >= dayStart && l.timestamp < dayEnd);
      const pomodoroMinutes = Math.round(todayPomos.reduce((s, l) => s + (l.duration || 0), 0) / 60);
      const result = await generateDailySuggestion(config, todayTasksBrief, localeKey, {
        pomodoroCount: todayPomos.length,
        pomodoroMinutes,
        unfinishedCount: todayTasksBrief.length,
      });
      if (result) {
        setDailySuggestion(result);
        writeDailyCache(SUGGESTION_CACHE_KEY, today, localeKey, result);
      }
    } catch {
      setSuggestionError(true);
    } finally {
      setSuggestionLoading(false);
    }
  };

  useEffect(() => {
    if (!getEffectiveApiKey(config)) return;
    // 优先用缓存;跨天/切语言/未生成过时才调 API
    const cached = readDailyCache<string>(SUGGESTION_CACHE_KEY, today, localeKey);
    if (cached) {
      setDailySuggestion(cached);
      return;
    }
    generateSuggestion(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getEffectiveApiKey(config), today, localeKey]);

  // Format local date elegantly
  const localDateStr = new Date().toLocaleDateString(
    config.locale === "en" ? "en-US" : "zh-CN",
    {
      month: "short",
      day: "numeric",
      weekday: "long",
    }
  );

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

      {/* 今日回顾 + 今日习惯 并排 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 今日回顾：任务 × 日记 × 番茄 */}
      <button
        type="button"
        onClick={() => onOpenJournal?.()}
        className="w-full text-left rounded-2xl bg-white/90 border border-[#EFEBE4] p-4 shadow-2xs hover:shadow-xs card-hover-lift cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] font-black text-[#4D7C5D] tracking-widest uppercase flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> {d.reviewTitle || "今日回顾"}
          </span>
          <span className="text-[9px] font-bold text-[#8B6E3C] opacity-80">
            {d.reviewOpenJournal || "去写日记"} →
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: d.reviewDone || "完成", value: String(review.completedCount), tone: "text-[#4D7C5D] bg-[#F0F5F1]" },
            { icon: <ListTodo className="w-3.5 h-3.5" />, label: d.reviewOpen || "待办", value: String(review.openDueCount), tone: "text-[#8B6E3C] bg-[#FAF8F5]" },
            { icon: <Timer className="w-3.5 h-3.5" />, label: d.reviewFocus || "专注", value: `${review.focusMinutes}${d.reviewMinutes || "分"}`, tone: "text-[#A64424] bg-[#FBECE5]" },
          ].map((cell) => (
            <div key={cell.label} className={`rounded-xl px-2.5 py-2.5 ${cell.tone}`}>
              <div className="flex items-center gap-1 opacity-70 mb-1">{cell.icon}<span className="text-[9px] font-bold">{cell.label}</span></div>
              <div className="text-sm font-black tracking-tight">{cell.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 font-medium">
          <BookOpen className="w-3.5 h-3.5 text-[#4D7C5D] flex-shrink-0" />
          <span className="truncate">
            {d.reviewJournal || "日记"}：
            {review.hasJournal
              ? (review.journalPreview || (d.reviewJournalDone || "已记录"))
              : (d.reviewJournalEmpty || "还没写")}
          </span>
        </div>
      </button>

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
              {d.quoteRefresh || "换一句"}
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

      {/* 今日习惯打卡 */}
      <HabitCard
        habits={habitsHook.habits}
        onToggle={habitsHook.toggleHabit}
        onAdd={habitsHook.addHabit}
        onRemove={habitsHook.removeHabit}
      />
      </div>


      {/* AI 每日建议 —— 当日缓存，进入即用；右上角提供手动重新生成 */}
      {getEffectiveApiKey(config) && (dailySuggestion || suggestionLoading || suggestionError) && (
        <div className="rounded-2xl bg-gradient-to-r from-[#F0F5F1] to-[#EBF3F6] border border-[#DEEAE2] p-4.5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#4D7C5D]" />
              <span className="text-[9px] font-black text-[#4D7C5D] tracking-widest uppercase">{d.aiSuggestionTitle || "AI 今日建议"}</span>
            </div>
            <button
              onClick={() => generateSuggestion(true)}
              disabled={suggestionLoading}
              className={`text-[9px] font-black flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                suggestionLoading
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-white/60 text-[#4D7C5D] hover:bg-white hover:scale-105 border border-[#DEEAE2]"
              }`}
              title={d.aiSuggestionRegenTitle || "重新生成今日建议"}
            >
              <RefreshCw className={`w-2.5 h-2.5 ${suggestionLoading ? "animate-spin" : ""}`} />
              {d.aiSuggestionRefresh || "换一条"}
            </button>
          </div>
          {suggestionLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#4D7C5D]/30 border-t-[#4D7C5D] rounded-full animate-spin" />
              <span className="text-[10px] text-slate-400 font-medium">{d.aiSuggestionThinking || "为你思考今日计划..."}</span>
            </div>
          ) : suggestionError && !dailySuggestion ? (
            <button
              type="button"
              onClick={() => generateSuggestion(true)}
              className="text-[11px] text-[#A34E36] font-medium hover:underline cursor-pointer"
            >
              {d.aiSuggestionRetry || "生成失败，点击重试"}
            </button>
          ) : (
            <p className="text-[11px] text-slate-700 leading-relaxed font-medium">{dailySuggestion}</p>
          )}
        </div>
      )}

      {/* AI 散文 */}
      <ProseCard config={config} tasks={tasks} />

      {/* Today's Tasks — 含今日 / 逾期 / 未设日期 */}
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
                const kind = getHomeTaskKind(task, today);
                const priorityBarClass = `task-bar-${task.category || "urgent-important"}`;
                
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

                const dueBadge =
                  kind === "overdue"
                    ? { text: d.overdue || "已逾期", cls: "text-[#A34E36] bg-[#FCF2F0] border-[#F5DFDB]" }
                    : kind === "undated"
                      ? { text: d.noDueDate || "未设日期", cls: "text-slate-400 bg-[#FAF8F5] border-[#EFEBE4]" }
                      : { text: d.dueToday, cls: "text-slate-400 bg-[#FAF8F5] border-[#EFEBE4]" };

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
                    
                    <span className={`text-[8px] font-black border px-1.5 py-0.5 rounded-md ${quadColor} shrink-0`}>
                      {quadLabel}
                    </span>

                    <div className="flex-grow min-w-0">
                      <p className="text-xs font-bold text-[#2D323A] truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-[9px] text-slate-400 font-semibold truncate mt-0.5">{task.description}</p>
                      )}
                    </div>

                    <span className={`text-[8.5px] font-black border px-2 py-0.5 rounded-lg shrink-0 ${dueBadge.cls} ${kind === "overdue" ? "" : "opacity-0 group-hover:opacity-100 transition-opacity"}`}>
                      {dueBadge.text}
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


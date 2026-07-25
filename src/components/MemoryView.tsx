import React, { useState, useMemo } from "react";
import {
  Calendar,
  Clock,
  BookOpen,
  CheckCircle2,
  Smile,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  Quote,
  Flame,
  Award,
  Filter,
  X,
  Tag,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { Task, PomodoroLog, JournalEntry, CustomizationConfig } from "../types";
import { useTranslation } from "../i18n/LanguageContext";
import { ProseCard } from "./ProseCard";
import { WeeklyReviewCard } from "./WeeklyReviewCard";

interface MemoryViewProps {
  tasks: Task[];
  completedTasks: Task[];
  pomodoroLogs: PomodoroLog[];
  journal: JournalEntry[];
  config: CustomizationConfig;
  onOpenJournalDate?: (date: string) => void;
}

type MemoryCardType = "all" | "journal" | "task" | "focus";

export const MemoryView: React.FC<MemoryViewProps> = ({
  tasks,
  completedTasks,
  pomodoroLogs,
  journal,
  config,
  onOpenJournalDate,
}) => {
  const { locale } = useTranslation();
  const isZh = locale === "zh-CN";

  // Filter states
  const [filterType, setFilterType] = useState<MemoryCardType>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  // Random Memory Card Drawer state
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [drawnCard, setDrawnCard] = useState<{
    type: "journal" | "task" | "focus";
    date: string;
    title: string;
    subtitle?: string;
    content?: string;
    mood?: string;
    aiComment?: string;
    count?: number;
  } | null>(null);

  // Available months extracted from data
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();

    journal.forEach((j) => {
      if (j.date && j.date.length >= 7) monthsSet.add(j.date.substring(0, 7));
    });

    completedTasks.forEach((t) => {
      if (t.completedAt) {
        const d = new Date(t.completedAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        monthsSet.add(`${y}-${m}`);
      } else if (t.dueDate && t.dueDate.length >= 7) {
        monthsSet.add(t.dueDate.substring(0, 7));
      }
    });

    pomodoroLogs.forEach((p) => {
      const d = new Date(p.timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      monthsSet.add(`${y}-${m}`);
    });

    const nowStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    monthsSet.add(nowStr);

    return Array.from(monthsSet).sort().reverse();
  }, [journal, completedTasks, pomodoroLogs]);

  // Handle Month Switch
  const handlePrevMonth = () => {
    const idx = availableMonths.indexOf(selectedMonth);
    if (idx < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[idx + 1]);
    }
  };

  const handleNextMonth = () => {
    const idx = availableMonths.indexOf(selectedMonth);
    if (idx > 0) {
      setSelectedMonth(availableMonths[idx - 1]);
    }
  };

  // Filtered Items for Selected Month
  const monthData = useMemo(() => {
    const monthJournals = journal.filter(
      (j) => j.date && j.date.startsWith(selectedMonth) && j.content.trim().length > 0
    );

    const monthTasksMap: Record<string, Task[]> = {};
    completedTasks.forEach((t) => {
      let dateStr = "";
      if (t.completedAt) {
        const d = new Date(t.completedAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dateStr = `${y}-${m}-${day}`;
      } else if (t.dueDate) {
        dateStr = t.dueDate;
      }

      if (dateStr && dateStr.startsWith(selectedMonth)) {
        if (!monthTasksMap[dateStr]) monthTasksMap[dateStr] = [];
        monthTasksMap[dateStr].push(t);
      }
    });

    const monthPomodoroMap: Record<string, { count: number; totalMinutes: number; logs: PomodoroLog[] }> = {};
    pomodoroLogs.forEach((p) => {
      const d = new Date(p.timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${day}`;

      if (dateStr.startsWith(selectedMonth)) {
        if (!monthPomodoroMap[dateStr]) {
          monthPomodoroMap[dateStr] = { count: 0, totalMinutes: 0, logs: [] };
        }
        monthPomodoroMap[dateStr].count += 1;
        monthPomodoroMap[dateStr].totalMinutes += p.duration || 25;
        monthPomodoroMap[dateStr].logs.push(p);
      }
    });

    const allDates = Array.from(
      new Set([
        ...monthJournals.map((j) => j.date),
        ...Object.keys(monthTasksMap),
        ...Object.keys(monthPomodoroMap),
      ])
    ).sort().reverse();

    const totalJournals = monthJournals.length;
    const totalCompletedTasks = Object.values(monthTasksMap).reduce((acc, cur) => acc + cur.length, 0);
    const totalFocusMinutes = Object.values(monthPomodoroMap).reduce((acc, cur) => acc + cur.totalMinutes, 0);
    const totalFocusHours = (totalFocusMinutes / 60).toFixed(1);

    const moodCounts: Record<string, number> = {};
    monthJournals.forEach((j) => {
      if (j.mood) {
        moodCounts[j.mood] = (moodCounts[j.mood] || 0) + 1;
      }
    });

    return {
      allDates,
      monthJournals,
      monthTasksMap,
      monthPomodoroMap,
      totalJournals,
      totalCompletedTasks,
      totalFocusMinutes,
      totalFocusHours,
      moodCounts,
    };
  }, [journal, completedTasks, pomodoroLogs, selectedMonth]);

  // Random Memory Card Drawer Function
  const handleDrawRandomCard = () => {
    const candidates: Array<{
      type: "journal" | "task" | "focus";
      date: string;
      title: string;
      subtitle?: string;
      content?: string;
      mood?: string;
      aiComment?: string;
      count?: number;
    }> = [];

    journal.forEach((j) => {
      if (j.content.trim()) {
        candidates.push({
          type: "journal",
          date: j.date,
          title: j.title || (isZh ? `日记 ${j.date}` : `Journal ${j.date}`),
          content: j.content,
          mood: j.mood,
          aiComment: j.aiComment,
        });
      }
    });

    Object.entries(monthData.monthTasksMap).forEach(([dateStr, tasksList]) => {
      if (tasksList.length > 0) {
        candidates.push({
          type: "task",
          date: dateStr,
          title: isZh ? `高光完成 ${tasksList.length} 项日程` : `Completed ${tasksList.length} Tasks`,
          subtitle: tasksList.map((t) => t.title).join(" • "),
          count: tasksList.length,
        });
      }
    });

    Object.entries(monthData.monthPomodoroMap).forEach(([dateStr, pomo]) => {
      if (pomo.count >= 2) {
        candidates.push({
          type: "focus",
          date: dateStr,
          title: isZh ? `深度专注 ${pomo.totalMinutes} 分钟` : `Deep Focus ${pomo.totalMinutes} Mins`,
          subtitle: isZh ? `完成了 ${pomo.count} 个番茄钟` : `Completed ${pomo.count} Pomodoros`,
          count: pomo.count,
        });
      }
    });

    if (candidates.length === 0) {
      setDrawnCard({
        type: "journal",
        date: new Date().toISOString().split("T")[0],
        title: isZh ? "开启第一篇时光记忆" : "Create Your First Memory",
        content: isZh
          ? "在日记本写下第一篇温情文字，或在待办里完成一项任务，让时光长廊留下属于你的美好痕迹吧！"
          : "Write your first journal or complete a task to create beautiful memory prints!",
      });
    } else {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      setDrawnCard(picked);
    }
    setDrawModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up pb-10">
      {/* 1. Header & Month Selector */}
      <div className="bg-white/80 dark:bg-[#1C1D21]/90 backdrop-blur-md border border-[#EFEBE4] dark:border-[#33353A] p-5 rounded-2xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#4D7C5D] dark:text-[#6FAD84]">
            <Sparkles className="w-5 h-5" />
            <h2 className="text-lg font-bold tracking-wide text-[#2D323A] dark:text-slate-100">
              {isZh ? "时光长廊 · 岁月印记" : "Memory Wall & Footprints"}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isZh
              ? "回顾过往在通云留下的每一篇手账、每一刻专注与每一次成长。"
              : "Reflect on every journal, focus session, and milestone captured in TongYun."}
          </p>
        </div>

        {/* Month Navigator & Drawer Action */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <button
            onClick={handleDrawRandomCard}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F0F5F1] dark:bg-[#232924] text-[#4D7C5D] dark:text-[#6FAD84] border border-[#C4D7B2]/50 dark:border-[#38433B] hover:bg-[#E2EDE5] dark:hover:bg-[#2C342C] transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-95"
            title={isZh ? "随机抽取一张记忆卡片" : "Draw a random memory card"}
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>{isZh ? "抽取记忆手牌" : "Draw Memory Card"}</span>
          </button>

          <div className="flex items-center gap-1.5 bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] p-1 rounded-xl">
            <button
              onClick={handlePrevMonth}
              disabled={availableMonths.indexOf(selectedMonth) >= availableMonths.length - 1}
              className="p-1 rounded-lg hover:bg-white dark:hover:bg-[#1C1D21] text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold font-mono px-2 text-[#2D323A] dark:text-slate-200">
              {selectedMonth}
            </span>
            <button
              onClick={handleNextMonth}
              disabled={availableMonths.indexOf(selectedMonth) <= 0}
              className="p-1 rounded-lg hover:bg-white dark:hover:bg-[#1C1D21] text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Monthly Summary Overview Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white/80 dark:bg-[#1C1D21]/90 border border-[#EFEBE4] dark:border-[#33353A] p-4 rounded-2xl flex items-center gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#F0F5F1] dark:bg-[#232924] text-[#4D7C5D] dark:text-[#6FAD84] flex items-center justify-center shrink-0 font-bold">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
              {isZh ? "手账与随记" : "Journals"}
            </div>
            <div className="text-lg font-bold font-mono text-[#2D323A] dark:text-slate-100">
              {monthData.totalJournals} <span className="text-xs font-sans font-normal text-slate-400">{isZh ? "篇" : "entries"}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#1C1D21]/90 border border-[#EFEBE4] dark:border-[#33353A] p-4 rounded-2xl flex items-center gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#EBF3ED] dark:bg-[#1E2E23] text-[#3F684C] dark:text-[#6FAD84] flex items-center justify-center shrink-0 font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
              {isZh ? "已完成任务" : "Tasks Completed"}
            </div>
            <div className="text-lg font-bold font-mono text-[#2D323A] dark:text-slate-100">
              {monthData.totalCompletedTasks} <span className="text-xs font-sans font-normal text-slate-400">{isZh ? "项" : "done"}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#1C1D21]/90 border border-[#EFEBE4] dark:border-[#33353A] p-4 rounded-2xl flex items-center gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#FFF8EE] dark:bg-[#2D261A] text-[#D97706] dark:text-[#F59E0B] flex items-center justify-center shrink-0 font-bold">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
              {isZh ? "深度专注时长" : "Focus Time"}
            </div>
            <div className="text-lg font-bold font-mono text-[#2D323A] dark:text-slate-100">
              {monthData.totalFocusHours} <span className="text-xs font-sans font-normal text-slate-400">{isZh ? "小时" : "hrs"}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#1C1D21]/90 border border-[#EFEBE4] dark:border-[#33353A] p-4 rounded-2xl flex items-center gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#FDF2F0] dark:bg-[#2F2121] text-[#A34E36] dark:text-[#E06D53] flex items-center justify-center shrink-0 font-bold">
            <Smile className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider truncate">
              {isZh ? "常见心情" : "Mood Trend"}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {Object.keys(monthData.moodCounts).length > 0 ? (
                Object.entries(monthData.moodCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([emoji, cnt]) => (
                    <span key={emoji} className="text-base" title={`${cnt} ${isZh ? "次" : "times"}`}>
                      {emoji}
                    </span>
                  ))
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{isZh ? "未记录" : "No mood"}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI 散文 */}
      <ProseCard config={config} tasks={tasks} />

      {/* AI 本周回顾 */}
      <WeeklyReviewCard
        config={config}
        completedTasks={completedTasks}
        pomodoroLogs={pomodoroLogs}
        journal={journal}
      />

      {/* 3. Filter Category Pills */}
      <div className="flex items-center gap-2 border-b border-[#EFEBE4] dark:border-[#33353A] pb-2 text-xs font-bold">
        <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
        {[
          { id: "all", label: isZh ? "全部印记" : "All Footprints" },
          { id: "journal", label: isZh ? "日记与手账" : "Journals" },
          { id: "task", label: isZh ? "完成高光" : "Tasks Done" },
          { id: "focus", label: isZh ? "专注足迹" : "Focus Logs" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setFilterType(item.id as MemoryCardType)}
            className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
              filterType === item.id
                ? "bg-[#4D7C5D] text-white border-[#4D7C5D] shadow-2xs"
                : "bg-white/60 dark:bg-[#1C1D21]/60 text-slate-500 dark:text-slate-400 border-[#EFEBE4] dark:border-[#33353A] hover:bg-white dark:hover:bg-[#1C1D21]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 4. Stream Timeline Canvas */}
      {monthData.allDates.length === 0 ? (
        <div className="bg-white/60 dark:bg-[#1C1D21]/60 border border-[#EFEBE4] dark:border-[#33353A] rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FAF8F5] dark:bg-[#282A30] flex items-center justify-center text-slate-300 dark:text-slate-600">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-500 dark:text-slate-400">
            {isZh ? `${selectedMonth} 暂无时光记录` : `No memory records for ${selectedMonth}`}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
            {isZh
              ? "试着在主页完成一项任务、或在日记本里随手写下一句当下的感悟吧。"
              : "Try completing a task or writing a journal entry to capture this month!"}
          </p>
        </div>
      ) : (
        <div className="relative pl-4 md:pl-8 space-y-8 before:absolute before:left-2 md:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#EFEBE4] dark:before:bg-[#33353A]">
          {monthData.allDates.map((dateStr) => {
            const dayJournals = monthData.monthJournals.filter((j) => j.date === dateStr);
            const dayTasks = monthData.monthTasksMap[dateStr] || [];
            const dayPomodoro = monthData.monthPomodoroMap[dateStr];

            const showJournal = (filterType === "all" || filterType === "journal") && dayJournals.length > 0;
            const showTask = (filterType === "all" || filterType === "task") && dayTasks.length > 0;
            const showFocus = (filterType === "all" || filterType === "focus") && dayPomodoro && dayPomodoro.count > 0;

            if (!showJournal && !showTask && !showFocus) return null;

            return (
              <div key={dateStr} className="relative group">
                {/* Timeline Dot Indicator */}
                <div className="absolute -left-4 md:-left-8 top-1.5 w-4 h-4 rounded-full bg-white dark:bg-[#1C1D21] border-2 border-[#4D7C5D] dark:border-[#6FAD84] shadow-xs group-hover:scale-125 transition-transform flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4D7C5D] dark:bg-[#6FAD84]" />
                </div>

                {/* Date Heading */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold font-mono text-[#2D323A] dark:text-slate-100 bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] px-2.5 py-0.5 rounded-lg">
                    {dateStr}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {new Date(dateStr).toLocaleDateString(locale, { weekday: "short" })}
                  </span>
                </div>

                {/* Cards Stream Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Journal Cards */}
                  {showJournal &&
                    dayJournals.map((j) => (
                      <div
                        key={j.id}
                        className="bg-[#FCFBF7] dark:bg-[#22242A] border border-[#EFEBE4] dark:border-[#33353A] p-4.5 rounded-2xl shadow-xs hover:shadow-md transition-all relative overflow-hidden group/card flex flex-col justify-between"
                      >
                        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#C4D7B2]/40 dark:bg-[#4D7C5D]/40" />

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2 pl-1">
                            <span className="text-xs font-bold text-[#4D7C5D] dark:text-[#6FAD84] flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>{j.title || (isZh ? "无题日记" : "Untitled")}</span>
                            </span>
                            {j.mood && (
                              <span className="text-lg hover:scale-125 transition-transform" title={isZh ? "当日心情" : "Mood"}>
                                {j.mood}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-300 font-serif leading-relaxed line-clamp-4 pl-1 whitespace-pre-wrap">
                            {j.content}
                          </p>

                          {/* AI Warm Comment Badge */}
                          {j.aiComment && (
                            <div className="mt-3 p-2.5 bg-[#F0F5F1]/80 dark:bg-[#232924] rounded-xl border border-[#C4D7B2]/30 dark:border-[#38433B] text-[11px] text-[#3F684C] dark:text-[#6FAD84] font-serif flex items-start gap-1.5">
                              <Quote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#4D7C5D] dark:text-[#6FAD84]" />
                              <span className="line-clamp-2">{j.aiComment}</span>
                            </div>
                          )}
                        </div>

                        {/* Card Footer Jump Action */}
                        <div className="mt-4 pt-2 border-t border-[#EFEBE4]/60 dark:border-[#33353A] flex items-center justify-between text-[10px] text-slate-400 pl-1">
                          <span>{new Date(j.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {onOpenJournalDate && (
                            <button
                              onClick={() => onOpenJournalDate(j.date)}
                              className="flex items-center gap-1 text-[#4D7C5D] dark:text-[#6FAD84] font-bold hover:underline cursor-pointer"
                            >
                              <span>{isZh ? "查阅日记本" : "Open Journal"}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                  {/* Highlighting Completed Tasks Card */}
                  {showTask && (
                    <div className="bg-white dark:bg-[#22242A] border border-[#EFEBE4] dark:border-[#33353A] p-4.5 rounded-2xl shadow-xs hover:shadow-md transition-all relative flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[#2E7D32] dark:text-[#66BB6A] flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#2E7D32] dark:text-[#66BB6A]" />
                            <span>{isZh ? `完成 ${dayTasks.length} 项成果` : `Completed ${dayTasks.length} Tasks`}</span>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8F5E9] dark:bg-[#1E2E23] text-[#2E7D32] dark:text-[#66BB6A]">
                            {isZh ? "已达成" : "Done"}
                          </span>
                        </div>

                        <div className="space-y-1.5 mt-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                          {dayTasks.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-[#FAF8F5] dark:bg-[#1C1D21] p-2 rounded-xl border border-[#EFEBE4]/60 dark:border-[#33353A]">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#4D7C5D] dark:bg-[#6FAD84] shrink-0" />
                              <span className="flex-grow truncate font-medium">{t.title}</span>
                              {t.tags && t.tags.length > 0 && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white dark:bg-[#282A30] text-slate-400 border border-[#EFEBE4] dark:border-[#383A42] shrink-0 flex items-center gap-0.5">
                                  <Tag className="w-2.5 h-2.5" />
                                  {t.tags[0]}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 pt-2 border-t border-[#EFEBE4]/60 dark:border-[#33353A] text-[10px] text-slate-400 flex justify-between items-center">
                        <span>{isZh ? "效率之日" : "Productive Day"}</span>
                        <Award className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                    </div>
                  )}

                  {/* Focus Pomodoro Highlights Card */}
                  {showFocus && (
                    <div className="bg-gradient-to-br from-[#FFFBF0] to-white dark:from-[#2D261A] dark:to-[#22242A] border border-[#F5E6C8] dark:border-[#423824] p-4.5 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[#D97706] dark:text-[#F59E0B] flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5" />
                            <span>{isZh ? "深度专注高光" : "Focus Highlights"}</span>
                          </span>
                          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-[#FEF3C7] dark:bg-[#3D3017] text-[#D97706] dark:text-[#F59E0B]">
                            {dayPomodoro.count} {isZh ? "个番茄" : "pomodoros"}
                          </span>
                        </div>

                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-2xl font-bold font-mono text-[#D97706] dark:text-[#F59E0B]">
                            {dayPomodoro.totalMinutes}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {isZh ? "分钟沉浸专注" : "minutes focused"}
                          </span>
                        </div>

                        {/* Recent Pomodoro Tasks */}
                        {dayPomodoro.logs.some((l) => l.taskTitle) && (
                          <div className="mt-2.5 text-[11px] text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-[#1C1D21]/80 p-2 rounded-xl border border-[#F5E6C8]/60 dark:border-[#423824] space-y-1">
                            {dayPomodoro.logs
                              .filter((l) => l.taskTitle)
                              .slice(0, 2)
                              .map((l, idx) => (
                                <div key={l.id || idx} className="truncate flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                  <Clock className="w-3 h-3 text-[#D97706] dark:text-[#F59E0B] shrink-0" />
                                  <span className="truncate">{l.taskTitle}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-2 border-t border-[#F5E6C8]/60 dark:border-[#423824] text-[10px] text-amber-700/60 dark:text-amber-400/60 flex justify-between items-center">
                        <span>{isZh ? "心流状态" : "In Flow"}</span>
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Draw Card Modal (Polaroid / Memory Card Drawer) */}
      {drawModalOpen && drawnCard && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#FCFBF7] dark:bg-[#1C1D21] border-4 border-white dark:border-[#33353A] p-6 rounded-3xl shadow-2xl max-w-sm w-full relative transform transition-all animate-scale-up text-[#2D323A] dark:text-slate-100">
            {/* Close Button */}
            <button
              onClick={() => setDrawModalOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Badge */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#4D7C5D] dark:text-[#6FAD84] mb-3 uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>{isZh ? "抽取记忆卡片" : "Memory Flashcard"}</span>
            </div>

            {/* Polaroid Frame Container */}
            <div className="bg-white dark:bg-[#22242A] p-4 rounded-2xl border border-[#EFEBE4] dark:border-[#33353A] shadow-inner space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{drawnCard.date}</span>
                {drawnCard.mood && <span className="text-xl">{drawnCard.mood}</span>}
              </div>

              <h3 className="text-base font-bold text-[#2D323A] dark:text-slate-100 font-serif leading-snug">
                {drawnCard.title}
              </h3>

              {drawnCard.content && (
                <p className="text-xs text-slate-600 dark:text-slate-300 font-serif leading-relaxed line-clamp-6 whitespace-pre-wrap bg-[#FAF8F5] dark:bg-[#1C1D21] p-3 rounded-xl border border-[#EFEBE4]/60 dark:border-[#33353A]">
                  {drawnCard.content}
                </p>
              )}

              {drawnCard.subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic bg-[#FAF8F5] dark:bg-[#1C1D21] p-2.5 rounded-xl border border-[#EFEBE4]/60 dark:border-[#33353A]">
                  {drawnCard.subtitle}
                </p>
              )}

              {drawnCard.aiComment && (
                <div className="p-2.5 bg-[#F0F5F1] dark:bg-[#232924] rounded-xl border border-[#C4D7B2]/30 dark:border-[#38433B] text-[11px] text-[#3F684C] dark:text-[#6FAD84] font-serif flex items-start gap-1">
                  <Quote className="w-3 h-3 shrink-0 mt-0.5 text-[#4D7C5D] dark:text-[#6FAD84]" />
                  <span>{drawnCard.aiComment}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-4 flex justify-between items-center">
              <button
                onClick={handleDrawRandomCard}
                className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-[#4D7C5D] dark:hover:text-[#6FAD84] font-bold cursor-pointer transition-colors"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>{isZh ? "再抽一张" : "Draw Another"}</span>
              </button>

              <button
                onClick={() => setDrawModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#4D7C5D] dark:bg-[#3F684C] text-white text-xs font-bold hover:bg-[#3F684C] transition-colors cursor-pointer shadow-2xs"
              >
                {isZh ? "收下感悟" : "Keep It"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

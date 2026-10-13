import React, { useState, useMemo } from "react";
import { Plus, Trash2, X, Check, CalendarDays, Moon } from "lucide-react";
import { Solar, Lunar } from "lunar-javascript";
import type { CountdownEvent } from "../types";
import { useTranslation } from "../i18n/LanguageContext";
import { parseLocalDate } from "../utils/date";

const EMOJI_OPTIONS = [
  "🎂",
  "🎄",
  "🎉",
  "💍",
  "✈️",
  "🏖",
  "🌸",
  "🍁",
  "🎊",
  "🎯",
  "⭐",
  "❤️",
  "🎮",
  "📚",
  "🏠",
];

const CARD_COLORS = [
  {
    bg: "bg-[#F0F5F1] dark:bg-[#1A251E]",
    border: "border-[#C4D7B2] dark:border-[#2C4233]",
    text: "text-[#4D7C5D] dark:text-[#78C496]",
    dot: "bg-[#4D7C5D] dark:bg-[#78C496]",
  },
  {
    bg: "bg-[#FCF2F0] dark:bg-[#2A1B1D]",
    border: "border-[#F5DFDB] dark:border-[#4B292D]",
    text: "text-[#A34E36] dark:text-[#E06D53]",
    dot: "bg-[#A34E36] dark:bg-[#E06D53]",
  },
  {
    bg: "bg-[#FBF4EC] dark:bg-[#2A2219]",
    border: "border-[#EDDCC8] dark:border-[#4A3824]",
    text: "text-[#C97D3E] dark:text-[#E5985A]",
    dot: "bg-[#C97D3E] dark:bg-[#E5985A]",
  },
  {
    bg: "bg-[#EEF5F8] dark:bg-[#17232B]",
    border: "border-[#C5DEE8] dark:border-[#263E4D]",
    text: "text-[#5B99B0] dark:text-[#77BED9]",
    dot: "bg-[#5B99B0] dark:bg-[#77BED9]",
  },
  {
    bg: "bg-[#F3F2F7] dark:bg-[#201E2B]",
    border: "border-[#E5E2EE] dark:border-[#38334E]",
    text: "text-[#5C528B] dark:text-[#9A8FE2]",
    dot: "bg-[#5C528B] dark:bg-[#9A8FE2]",
  },
  {
    bg: "bg-[#FBF8EC] dark:bg-[#272517]",
    border: "border-[#EDE5C8] dark:border-[#474223]",
    text: "text-[#A08B30] dark:text-[#D1B846]",
    dot: "bg-[#A08B30] dark:bg-[#D1B846]",
  },
];

// Helper to calculate target solar date for lunar events
function getLunarNextSolarDate(targetDateStr: string): string {
  try {
    const parts = targetDateStr.split("-").map(Number);
    if (parts.length < 3) return targetDateStr;
    const s = Solar.fromYmd(parts[0], parts[1], parts[2]);
    const l = s.getLunar();
    const lMonth = (l as any).getMonth();
    const lDay = (l as any).getDay();

    const now = new Date();
    const currentYear = now.getFullYear();

    // Calculate this year's solar date for lunar month/day
    let targetLunar = (Lunar as any).fromYmd(currentYear, lMonth, lDay);
    let targetSolar = targetLunar.getSolar();
    let targetDate = new Date(
      targetSolar.getYear(),
      targetSolar.getMonth() - 1,
      targetSolar.getDay(),
    );

    // If past today's zero timestamp, roll over to next year
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (targetDate.getTime() < todayZero.getTime()) {
      targetLunar = (Lunar as any).fromYmd(currentYear + 1, lMonth, lDay);
      targetSolar = targetLunar.getSolar();
      targetDate = new Date(
        targetSolar.getYear(),
        targetSolar.getMonth() - 1,
        targetSolar.getDay(),
      );
    }

    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, "0");
    const d = String(targetDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return targetDateStr;
  }
}

function getDaysInfo(
  targetDate: string,
  isLunar?: boolean,
): {
  days: number;
  label: string;
  isOverdue: boolean;
  isToday: boolean;
  effectiveTargetDate: string;
} {
  const effectiveTargetDate = isLunar ? getLunarNextSolarDate(targetDate) : targetDate;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = parseLocalDate(effectiveTargetDate) || new Date(effectiveTargetDate);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  return {
    days: Math.abs(diff),
    label: diff > 0 ? "daysLater" : diff < 0 ? "daysAgo" : "today",
    isOverdue: diff < 0,
    isToday: diff === 0,
    effectiveTargetDate,
  };
}

interface CountdownViewProps {
  countdowns: CountdownEvent[];
  handleAddCountdown: (event: {
    title: string;
    targetDate: string;
    emoji?: string;
    color?: string;
    isLunar?: boolean;
  }) => void;
  handleDeleteCountdown: (id: string) => void;
}

export const CountdownView: React.FC<CountdownViewProps> = React.memo(
  ({ countdowns, handleAddCountdown, handleDeleteCountdown }) => {
    const { t } = useTranslation();
    const c = t.countdown;
    const [showForm, setShowForm] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDate, setNewDate] = useState("");
    const [newEmoji, setNewEmoji] = useState("🎯");
    const [isLunar, setIsLunar] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const sorted = useMemo(() => {
      return [...countdowns].sort((a, b) => {
        const infoA = getDaysInfo(a.targetDate, a.isLunar);
        const infoB = getDaysInfo(b.targetDate, b.isLunar);
        const dateA =
          parseLocalDate(infoA.effectiveTargetDate) || new Date(infoA.effectiveTargetDate);
        const dateB =
          parseLocalDate(infoB.effectiveTargetDate) || new Date(infoB.effectiveTargetDate);
        return dateA.getTime() - dateB.getTime();
      });
    }, [countdowns]);

    // 时间分组：今天 / 本周 / 本月 / 更远 / 已过期
    const grouped = useMemo(() => {
      const g: { key: string; label: string; events: typeof sorted }[] = [
        { key: "today", label: (c as any).groupToday || "今天", events: [] },
        { key: "thisWeek", label: (c as any).groupThisWeek || "本周", events: [] },
        { key: "thisMonth", label: (c as any).groupThisMonth || "本月", events: [] },
        { key: "later", label: (c as any).groupLater || "更远", events: [] },
        { key: "overdue", label: (c as any).groupOverdue || "已过期", events: [] },
      ];
      sorted.forEach((e) => {
        const info = getDaysInfo(e.targetDate, e.isLunar);
        if (info.isToday) g[0].events.push(e);
        else if (info.isOverdue) g[4].events.push(e);
        else if (info.days <= 7) g[1].events.push(e);
        else if (info.days <= 30) g[2].events.push(e);
        else g[3].events.push(e);
      });
      return g.filter((grp) => grp.events.length > 0);
    }, [sorted, c]);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTitle.trim() || !newDate) return;
      handleAddCountdown({
        title: newTitle.trim(),
        targetDate: newDate,
        emoji: newEmoji,
        isLunar,
      });
      setNewTitle("");
      setNewDate("");
      setNewEmoji("🎯");
      setIsLunar(false);
      setShowForm(false);
    };

    return (
      <div className="animate-fade-in-up flex flex-col gap-5 flex-grow z-10 relative select-none max-w-4xl mx-auto w-full pt-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[#2D323A] dark:text-slate-100 tracking-tight">
            {c.title}{" "}
            {countdowns.length > 0 && (
              <span className="text-sm text-slate-400 font-bold">· {countdowns.length}</span>
            )}
          </h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#4D7C5D] hover:bg-[#3F684C] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            {c.addEvent}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-white/80 dark:bg-[#16171B]/90 border border-[#EFEBE4] dark:border-[#282A30] p-5 shadow-sm space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {c.eventName}
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={c.eventNamePlaceholder}
                  className="w-full bg-white dark:bg-[#202228] border border-[#EFEBE4] dark:border-[#2E313A] px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#78C496] focus:ring-1 focus:ring-[#4D7C5D]/20 transition-all"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {c.targetDate}
                  </label>
                  <label className="flex items-center gap-1 text-[10px] font-bold text-[#4D7C5D] dark:text-[#78C496] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isLunar}
                      onChange={(e) => setIsLunar(e.target.checked)}
                      className="accent-[#4D7C5D] rounded"
                    />
                    <Moon className="w-3 h-3" />
                    <span>按农历生日/节日每年重复</span>
                  </label>
                </div>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-white dark:bg-[#202228] border border-[#EFEBE4] dark:border-[#2E313A] px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-100 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#78C496] focus:ring-1 focus:ring-[#4D7C5D]/20 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {c.emoji}
              </label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewEmoji(emoji)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all cursor-pointer border ${
                      newEmoji === emoji
                        ? "border-[#4D7C5D] dark:border-[#78C496] bg-[#F0F5F1] dark:bg-[#1C2820] scale-110 shadow-xs"
                        : "border-transparent hover:bg-[#FAF8F5] dark:hover:bg-[#202228]"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#202228] transition-all cursor-pointer border border-[#EFEBE4] dark:border-[#2E313A]"
              >
                {c.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#4D7C5D] hover:bg-[#3F684C] transition-all cursor-pointer shadow-xs"
              >
                {c.save}
              </button>
            </div>
          </form>
        )}

        {/* Card grid — grouped */}
        {sorted.length > 0 ? (
          grouped.map((grp) => (
            <div key={grp.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {grp.label}
                </h3>
                <span className="text-[9px] text-slate-300 dark:text-slate-500 font-bold">{grp.events.length}</span>
                <span className="flex-1 h-px bg-[#EFEBE4] dark:bg-[#33353A]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grp.events.map((event, idx) => {
                  const info = getDaysInfo(event.targetDate, event.isLunar);
                  const color = CARD_COLORS[idx % CARD_COLORS.length];
                  return (
                    <div
                      key={event.id}
                      className={`rounded-2xl border-2 p-5 shadow-sm hover:shadow-md transition-all duration-300 card-hover-lift relative group ${
                        info.isOverdue
                          ? "bg-red-50 dark:bg-[#341B1E] border-red-200 dark:border-[#52252A]"
                          : info.isToday
                            ? "bg-[#F0F5F1] dark:bg-[#1A251E] border-[#C4D7B2] dark:border-[#2C4233]"
                            : `${color.bg} ${color.border}`
                      }`}
                    >
                      {/* Delete button */}
                      {confirmDelete === event.id ? (
                        <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                          <button
                            onClick={() => {
                              handleDeleteCountdown(event.id);
                              setConfirmDelete(null);
                            }}
                            className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all cursor-pointer"
                            title={t.common.confirm}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="w-6 h-6 rounded-full bg-slate-200 dark:bg-[#2B2D35] text-slate-500 dark:text-slate-300 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-[#363942] transition-all cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(event.id)}
                          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/85 dark:bg-[#202228]/85 border border-[#EFEBE4] dark:border-[#2E313A] flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-[#341B1E] opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
                          title={c.delete}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}

                      {/* Header Badges */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-4xl">{event.emoji || "📅"}</div>
                        {event.isLunar && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-[#332918] text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-[#524125] flex items-center gap-0.5">
                            <Moon className="w-2.5 h-2.5" />
                            <span>农历重复</span>
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-extrabold text-[#2D323A] dark:text-slate-100 truncate mb-2">
                        {event.title}
                      </h3>

                      {/* Days count */}
                      <div
                        className={`text-3xl font-black tracking-tight mb-1 ${
                          info.isOverdue
                            ? "text-red-500 dark:text-red-400"
                            : info.isToday
                              ? "text-[#4D7C5D] dark:text-[#78C496]"
                              : color.text
                        }`}
                      >
                        {info.isToday ? "🎉" : `${info.days}`}
                      </div>

                      {/* Label */}
                      <p
                        className={`text-xs font-bold ${
                          info.isOverdue
                            ? "text-red-400"
                            : info.isToday
                              ? "text-[#4D7C5D] dark:text-[#78C496]"
                              : "text-slate-400"
                        }`}
                      >
                        {info.isToday
                          ? c.today
                          : c[info.label].replace("{days}", String(info.days))}
                      </p>

                      {/* Target date info */}
                      <div className="flex items-center justify-between mt-3 text-[9px] text-slate-400 font-medium pt-2 border-t border-black/5 dark:border-white/10">
                        <div className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          <span>{event.targetDate}</span>
                        </div>
                        {event.isLunar && (
                          <span className="font-mono text-[#4D7C5D] dark:text-[#78C496] font-bold">
                            下一个目标日: {info.effectiveTargetDate}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-white/60 dark:bg-[#16171B]/60 border-2 border-dashed border-[#EFEBE4] dark:border-[#282A30] p-12 flex flex-col items-center justify-center gap-3 text-center">
            <span className="text-5xl">⏳</span>
            <p className="text-sm text-slate-400 font-bold">{c.empty}</p>
          </div>
        )}
      </div>
    );
  },
);

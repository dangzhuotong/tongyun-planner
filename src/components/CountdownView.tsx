import React, { useState, useMemo } from "react";
import { Plus, Trash2, X, Check, CalendarDays } from "lucide-react";
import type { CountdownEvent } from "../types";
import { useTranslation } from "../i18n/LanguageContext";

const EMOJI_OPTIONS = ["🎂", "🎄", "🎉", "💍", "✈️", "🏖", "🌸", "🍁", "🎊", "🎯", "⭐", "❤️", "🎮", "📚", "🏠"];

const CARD_COLORS = [
  { bg: "bg-[#F0F5F1]", border: "border-[#C4D7B2]", text: "text-[#4D7C5D]", dot: "bg-[#4D7C5D]" },
  { bg: "bg-[#FCF2F0]", border: "border-[#F5DFDB]", text: "text-[#A34E36]", dot: "bg-[#A34E36]" },
  { bg: "bg-[#FBF4EC]", border: "border-[#EDDCC8]", text: "text-[#C97D3E]", dot: "bg-[#C97D3E]" },
  { bg: "bg-[#EEF5F8]", border: "border-[#C5DEE8]", text: "text-[#5B99B0]", dot: "bg-[#5B99B0]" },
  { bg: "bg-[#F3F2F7]", border: "border-[#E5E2EE]", text: "text-[#5C528B]", dot: "bg-[#5C528B]" },
  { bg: "bg-[#FBF8EC]", border: "border-[#EDE5C8]", text: "text-[#A08B30]", dot: "bg-[#A08B30]" },
];

function getDaysInfo(targetDate: string): { days: number; label: string; isOverdue: boolean; isToday: boolean } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  return {
    days: Math.abs(diff),
    label: diff > 0 ? "daysLater" : diff < 0 ? "daysAgo" : "today",
    isOverdue: diff < 0,
    isToday: diff === 0,
  };
}

interface CountdownViewProps {
  countdowns: CountdownEvent[];
  handleAddCountdown: (event: { title: string; targetDate: string; emoji?: string; color?: string }) => void;
  handleDeleteCountdown: (id: string) => void;
}

export const CountdownView: React.FC<CountdownViewProps> = React.memo(({
  countdowns,
  handleAddCountdown,
  handleDeleteCountdown,
}) => {
  const { t } = useTranslation();
  const c = t.countdown;
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newEmoji, setNewEmoji] = useState("🎯");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sorted = useMemo(() => [...countdowns].sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()), [countdowns]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;
    handleAddCountdown({ title: newTitle.trim(), targetDate: newDate, emoji: newEmoji });
    setNewTitle("");
    setNewDate("");
    setNewEmoji("🎯");
    setShowForm(false);
  };

  return (
    <div className="animate-fade-in-up flex flex-col gap-5 flex-grow z-10 relative select-none max-w-4xl mx-auto w-full pt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-[#2D323A] tracking-tight">
          {c.title} {countdowns.length > 0 && <span className="text-sm text-slate-400 font-bold">· {countdowns.length}</span>}
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
          className="rounded-2xl bg-white/80 border border-[#EFEBE4] p-5 shadow-sm space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{c.eventName}</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={c.eventNamePlaceholder}
                className="w-full bg-white border border-[#EFEBE4] px-3 py-2 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-300 focus:outline-none focus:border-[#4D7C5D] focus:ring-1 focus:ring-[#4D7C5D]/20 transition-all"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{c.targetDate}</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-white border border-[#EFEBE4] px-3 py-2 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-[#4D7C5D] focus:ring-1 focus:ring-[#4D7C5D]/20 transition-all"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{c.emoji}</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setNewEmoji(emoji)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all cursor-pointer border ${
                    newEmoji === emoji ? "border-[#4D7C5D] bg-[#F0F5F1] scale-110 shadow-xs" : "border-transparent hover:bg-[#FAF8F5]"
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
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-[#FAF8F5] transition-all cursor-pointer border border-[#EFEBE4]"
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

      {/* Card grid */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((event, idx) => {
            const info = getDaysInfo(event.targetDate);
            const color = CARD_COLORS[idx % CARD_COLORS.length];
            return (
              <div
                key={event.id}
                className={`rounded-2xl border-2 p-5 shadow-sm hover:shadow-md transition-all duration-300 card-hover-lift relative group ${
                  info.isOverdue
                    ? "bg-red-50 border-red-200"
                    : info.isToday
                    ? "bg-[#F0F5F1] border-[#C4D7B2]"
                    : `${color.bg} ${color.border}`
                }`}
              >
                {/* Delete button */}
                {confirmDelete === event.id ? (
                  <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                    <button
                      onClick={() => { handleDeleteCountdown(event.id); setConfirmDelete(null); }}
                      className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all cursor-pointer"
                      title={t.common.confirm}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-300 transition-all cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(event.id)}
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/85 border border-[#EFEBE4] flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
                    title={c.delete}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}

                {/* Emoji */}
                <div className="text-4xl mb-3">{event.emoji || "📅"}</div>

                {/* Title */}
                <h3 className="text-sm font-extrabold text-[#2D323A] truncate mb-2">
                  {event.title}
                </h3>

                {/* Days count */}
                <div className={`text-3xl font-black tracking-tight mb-1 ${
                  info.isOverdue ? "text-red-500" : info.isToday ? "text-[#4D7C5D]" : color.text
                }`}>
                  {info.isToday ? "🎉" : `${info.days}`}
                </div>

                {/* Label */}
                <p className={`text-xs font-bold ${
                  info.isOverdue ? "text-red-400" : info.isToday ? "text-[#4D7C5D]" : "text-slate-400"
                }`}>
                  {info.isToday ? c.today : c[info.label].replace("{days}", `${info.days}${c.daysLabel}`)}
                </p>

                {/* Target date */}
                <div className="flex items-center gap-1 mt-3 text-[9px] text-slate-400 font-medium">
                  <CalendarDays className="w-3 h-3" />
                  <span>{event.targetDate}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-white/60 border-2 border-dashed border-[#EFEBE4] p-12 flex flex-col items-center justify-center gap-3 text-center">
          <span className="text-5xl">⏳</span>
          <p className="text-sm text-slate-400 font-bold">{c.empty}</p>
        </div>
      )}
    </div>
  );
});

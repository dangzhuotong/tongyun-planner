import React, { useMemo, useState } from "react";
import { Plus, Flame, Circle, CheckCircle2, Trash2 } from "lucide-react";
import { getLocalDateString } from "../utils/date";
import { habitsBrokenYesterday } from "../utils/dailyReview";
import { usePersonal } from "../context/PersonalContext";

const HABIT_EMOJIS = ["💪", "📖", "🧘", "🏃", "💧", "🥗", "🌙", "☀️", "🎯", "✍️", "🎨", "🧠"];

export const HabitsView: React.FC = React.memo(() => {
  const { habits, habitLogs, handleAddHabit: onAddHabit, handleDeleteHabit: onDeleteHabit, handleToggleHabitLog: onToggleLog } = usePersonal();
  const today = getLocalDateString();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newEmoji, setNewEmoji] = useState("💪");

  const broken = useMemo(
    () => habitsBrokenYesterday(habits, habitLogs, today),
    [habits, habitLogs, today]
  );

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAddHabit(newTitle.trim(), newEmoji);
    setNewTitle("");
    setShowAdd(false);
  };

  const getStreak = (habitId: string): number => {
    let streak = 0;
    const d = new Date();
    while (true) {
      const dateStr = getLocalDateString(d);
      const logs = habitLogs[dateStr] || [];
      if (logs.includes(habitId)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  const getWeekLogs = (habitId: string): boolean[] => {
    const days: boolean[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      days.push((habitLogs[dateStr] || []).includes(habitId));
    }
    return days;
  };

  return (
    <div className="animate-fade-in-up flex flex-col gap-4 flex-grow z-10 relative select-none max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#2D323A] flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#E8A0BF]" />
          习惯打卡
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs px-3.5 py-2 rounded-xl font-bold border border-[#DEEAE2] bg-[#F0F5F1] text-[#4D7C5D] hover:bg-[#E4EDE6] transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          添加习惯
        </button>
      </div>

      {broken.length > 0 && (
        <div className="rounded-2xl border border-[#F6DCD2] bg-[#FBECE5]/70 px-4 py-3 text-[11px] text-[#A64424] font-medium leading-relaxed">
          <span className="font-bold">昨天断签：</span>
          {broken.map((h) => `${h.emoji} ${h.title}`).join("、")}
          <span className="text-[#A64424]/70"> — 今天补上？</span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {broken.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onToggleLog(h.id, today)}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/80 border border-[#F6DCD2] hover:border-[#E57C58] cursor-pointer transition-colors"
              >
                {h.emoji} 补打卡
              </button>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-white/80 border border-[#EFEBE4] p-4 rounded-2xl space-y-3 animate-fade-in-up">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="习惯名称，如：每天阅读 30 分钟"
            className="w-full bg-white border border-[#EFEBE4] px-3 py-2 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400">图标</span>
            <div className="flex gap-1 flex-wrap">
              {HABIT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setNewEmoji(emoji)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all cursor-pointer ${
                    newEmoji === emoji ? "bg-[#F0F5F1] ring-1 ring-[#C4D7B2]" : "hover:bg-[#FAF8F5]"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="text-[10px] px-3 py-1.5 rounded-lg border border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] transition-all cursor-pointer">取消</button>
            <button onClick={handleAdd} className="text-[10px] px-3 py-1.5 rounded-lg bg-[#4D7C5D] text-white font-bold hover:bg-[#3F684C] transition-all cursor-pointer">添加</button>
          </div>
        </div>
      )}

      {habits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <span className="text-4xl">🌱</span>
          <p className="text-sm text-slate-400 font-bold">还没有习惯</p>
          <p className="text-xs text-slate-300 font-medium">添加一个习惯，每天打卡记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {habits.map((habit) => {
            const isDoneToday = (habitLogs[today] || []).includes(habit.id);
            const streak = getStreak(habit.id);
            const weekLogs = getWeekLogs(habit.id);

            return (
              <div
                key={habit.id}
                className="bg-white/70 border border-[#EFEBE4] rounded-2xl p-4 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggleLog(habit.id, today)}
                    className={`shrink-0 transition-all cursor-pointer ${isDoneToday ? "text-[#4D7C5D]" : "text-slate-300 hover:text-[#4D7C5D]"}`}
                  >
                    {isDoneToday ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </button>
                  <span className="text-xl">{habit.emoji}</span>
                  <span className={`flex-grow text-sm font-bold ${isDoneToday ? "text-slate-500" : "text-[#2D323A]"}`}>
                    {habit.title}
                  </span>
                  <div className="flex items-center gap-1 text-[#E8A0BF]">
                    <Flame className="w-4 h-4" />
                    <span className="text-xs font-black">{streak}</span>
                  </div>
                  <button
                    onClick={() => onDeleteHabit(habit.id)}
                    className="text-slate-300 hover:text-red-400 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-1.5 mt-3 ml-11">
                  {weekLogs.map((done, i) => (
                    <div
                      key={i}
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold transition-all ${
                        done
                          ? "bg-[#C4D7B2] text-white"
                          : "bg-[#FAF8F5] text-slate-300 border border-[#EFEBE4]"
                      }`}
                    >
                      {["日", "一", "二", "三", "四", "五", "六"][i]}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

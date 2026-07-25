import React, { useState } from "react";
import { Plus, Trash2, Check, Flame, Heart } from "lucide-react";
import type { HabitItem } from "../types";
import { useTranslation } from "../i18n/LanguageContext";

const EMOJI_PRESETS = ["💪", "📖", "🧘", "🌙", "💧", "🏃", "🎯", "🎸", "🍳", "✍️"];

interface HabitCardProps {
  habits: HabitItem[];
  onToggle: (id: string) => void;
  onAdd: (name: string, emoji: string) => void;
  onRemove: (id: string) => void;
}

export const HabitCard: React.FC<HabitCardProps> = ({
  habits,
  onToggle,
  onAdd,
  onRemove,
}) => {
  const { t } = useTranslation();
  const h = t.habits;

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("💪");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAdd(newName.trim(), newEmoji);
    setNewName("");
    setNewEmoji("💪");
    setShowAdd(false);
  };

  const doneCount = habits.filter((h) => h.doneToday).length;
  const totalCount = habits.length;

  return (
    <div className="rounded-2xl bg-white/80 dark:bg-[#1C1D21]/90 border border-[#EFEBE4] dark:border-[#33353A] p-4 shadow-2xs">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-black text-[#A34E36] dark:text-[#E06D53] tracking-widest uppercase flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5" />
          {h.title}
          {totalCount > 0 && (
            <span className="text-slate-400 dark:text-slate-500 font-medium">
              {doneCount}/{totalCount}
            </span>
          )}
        </span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className={`text-[9px] font-black flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
            showAdd
              ? "bg-[#A34E36]/10 text-[#A34E36] dark:text-[#E06D53] dark:bg-[#3D2325]"
              : "bg-[#FCF2F0] dark:bg-[#3D2325] text-[#A34E36] dark:text-[#E06D53] hover:bg-[#F7E3DF] dark:hover:bg-[#4D2D30]"
          }`}
        >
          <Plus className="w-2.5 h-2.5" />
          {h.add}
        </button>
      </div>

      {/* 新增表单 */}
      {showAdd && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2 mb-3 pb-3 border-b border-[#EFEBE4] dark:border-[#33353A]">
          <div className="flex items-center gap-1">
            {EMOJI_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setNewEmoji(emoji)}
                className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-all cursor-pointer ${
                  newEmoji === emoji
                    ? "bg-[#A34E36]/10 ring-1 ring-[#A34E36]/30 scale-110"
                    : "hover:bg-slate-100 dark:hover:bg-[#282A30]"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={h.placeholder}
            className="flex-1 bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#33353A] px-2.5 py-1 rounded-lg text-[10px] font-medium text-slate-700 dark:text-slate-200 placeholder-slate-300 focus:outline-none focus:border-[#A34E36] min-w-0"
            autoFocus
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="p-1.5 rounded-lg bg-[#A34E36] dark:bg-[#E06D53] text-white disabled:opacity-30 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
          >
            <Check className="w-3 h-3" />
          </button>
        </form>
      )}

      {/* 习惯列表 */}
      {habits.length === 0 ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold text-center py-3">
          {h.empty}
        </p>
      ) : (
        <div className="space-y-1.5">
          {habits.map((habit) => (
            <div
              key={habit.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[#FAF8F5] dark:hover:bg-[#24262B] transition-colors group"
            >
              {/* 打卡按钮 */}
              <button
                onClick={() => onToggle(habit.id)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all shrink-0 cursor-pointer ${
                  habit.doneToday
                    ? "bg-[#A34E36] dark:bg-[#E06D53] text-white shadow-sm scale-100"
                    : "bg-[#FCF2F0] dark:bg-[#3D2325] border-2 border-[#F5DFDB] dark:border-[#422D30] text-transparent hover:border-[#E06D53] scale-90 hover:scale-100"
                }`}
              >
                <Check className={`w-3 h-3 transition-all ${habit.doneToday ? "opacity-100" : "opacity-0 group-hover:opacity-30"}`} />
              </button>

              {/* 习惯名 */}
              <span className={`text-[12px] font-bold transition-all flex-1 ${
                habit.doneToday
                  ? "text-slate-400 dark:text-slate-500 line-through"
                  : "text-slate-700 dark:text-slate-200"
              }`}>
                {habit.emoji} {habit.name}
              </span>

              {/* 连续天数 */}
              {habit.streak > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-black text-[#C97D3E] dark:text-[#E0A44E] shrink-0">
                  <Flame className="w-3 h-3" />
                  {habit.streak}
                </span>
              )}

              {/* 删除 */}
              <button
                onClick={() => onRemove(habit.id)}
                className="w-5 h-5 rounded flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

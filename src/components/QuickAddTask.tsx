import React, { useState, useEffect, useRef } from "react";
import { Plus, Calendar, Flag, Repeat, Zap } from "lucide-react";
import type { Task, TimeBlock, TaskPriority } from "../types";
import { PRIORITY_OPTIONS, PRIORITY_LEVELS } from "../constants";
import { CustomSelect } from "./CustomSelect";
import { useTranslation } from "../i18n/LanguageContext";
import { getLocalDateString } from "../utils/date";
import { parseNaturalDate, formatNaturalPreview } from "../utils/dateParser";
import { buildRRule, rruleToLabel } from "../utils/rrule";

interface QuickAddTaskProps {
  handleAddTask: (taskData: {
    title: string;
    description: string;
    notes: string;
    category: Task["category"];
    dueDate: string;
    dueTime?: string;
    repeat?: string;
    tags?: string[];
    priority?: Task["priority"];
  }) => void;
  timeBlocks?: TimeBlock[];
  onAddTimeBlock?: (block: TimeBlock) => void;
  defaultDueDate?: string;
  defaultCategory?: Task["category"];
  placeholder?: string;
  compact?: boolean; // If true, hides description, notes, priority dropdown, etc., just a clean single-line bar
}

const LAST_QUICK_CATEGORY_KEY = "tongyun_last_quick_category";
const VALID_CATEGORIES: Task["category"][] = [
  "urgent-important",
  "important-not-urgent",
  "urgent-not-important",
  "not-urgent-not-important",
];

function readLastQuickCategory(): Task["category"] {
  try {
    const v = localStorage.getItem(LAST_QUICK_CATEGORY_KEY);
    if (v && (VALID_CATEGORIES as string[]).includes(v)) return v as Task["category"];
  } catch { /* ignore */ }
  return "important-not-urgent";
}

export const QuickAddTask: React.FC<QuickAddTaskProps> = React.memo(({
  handleAddTask,
  defaultDueDate,
  defaultCategory,
  placeholder = "添加任务，按回车保存...",
  compact = false,
}) => {
  const { t } = useTranslation();
  const q = t.quickAdd;
  const tc = t.taskCard;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState(() => defaultDueDate || getLocalDateString());
  const [dueTime, setDueTime] = useState("");
  const [category, setCategory] = useState<Task["category"]>(() => defaultCategory ?? readLastQuickCategory());
  const [repeat, setRepeat] = useState<string>("none");
  const [showRepeatModal, setShowRepeatModal] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatByDay, setRepeatByDay] = useState<number[]>([]);
  const [repeatBySetPos, setRepeatBySetPos] = useState<number | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  
  // Track focus to expand extra options (date, priority, etc.) in non-compact mode
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync calendar selected date with local form state
  useEffect(() => {
    if (defaultDueDate) {
      setDueDate(defaultDueDate);
    }
  }, [defaultDueDate]);

  // Sync default category if parent passes one (e.g. Matrix quadrant); otherwise keep last choice
  useEffect(() => {
    if (defaultCategory) {
      setCategory(defaultCategory);
    }
  }, [defaultCategory]);

  // Click outside to collapse extra options
  useEffect(() => {
    if (compact) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [compact]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    handleAddTask({
      title: title.trim(),
      description: description.trim(),
      notes: notes.trim(),
      category,
      dueDate,
      dueTime: dueTime || undefined,
      repeat: repeat !== "none" ? repeat : undefined,
      tags: tags.length > 0 ? tags : undefined,
      priority,
    });

    try {
      localStorage.setItem(LAST_QUICK_CATEGORY_KEY, category);
    } catch { /* ignore */ }

    // Reset fields except date, category, and repeat for ease of adding multiple
    setTitle("");
    setDescription("");
    setNotes("");
    setDueTime("");
    setTags([]);
    setTagInput("");
    setIsFocused(false);
  };

  // Custom repeat modal
  const RepeatModal = () => {
    const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
    const freqLabel = repeatFreq === 'DAILY' ? '天' : repeatFreq === 'WEEKLY' ? '周' : '月';
    const handleConfirm = () => {
      const rrule = buildRRule(repeatFreq, {
        interval: repeatInterval,
        byDay: repeatFreq === 'WEEKLY' && repeatByDay.length > 0 ? repeatByDay : undefined,
        bySetPos: repeatFreq === 'MONTHLY' ? repeatBySetPos : undefined,
      });
      setRepeat(rrule);
      setShowRepeatModal(false);
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/50 backdrop-blur-sm" onClick={() => setShowRepeatModal(false)}>
        <div className="bg-white dark:bg-[#1C1D21] rounded-2xl shadow-xl border border-[#EFEBE4] dark:border-[#33353A] p-5 w-72 animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-4">自定义重复</h3>
          {/* Frequency */}
          <div className="flex gap-2 mb-3">
            {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(f => (
              <button key={f} onClick={() => setRepeatFreq(f)} className={`flex-1 text-[10px] font-bold py-2 rounded-xl border transition-all cursor-pointer ${repeatFreq === f ? 'bg-[#4D7C5D] text-white border-[#4D7C5D]' : 'bg-[#FAF8F5] dark:bg-[#282A30] text-slate-600 dark:text-slate-300 border-[#EFEBE4] dark:border-[#383A42] hover:border-[#C4D7B2]'}`}>
                {f === 'DAILY' ? '每天' : f === 'WEEKLY' ? '每周' : '每月'}
              </button>
            ))}
          </div>
          {/* Interval */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">每</span>
            <input type="number" min={1} max={99} value={repeatInterval} onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))} className="w-14 bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-bold text-center focus:outline-none focus:border-[#C4D7B2]" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{freqLabel}</span>
          </div>
          {/* Weekly day picker */}
          {repeatFreq === 'WEEKLY' && (
            <div className="flex gap-1 mb-3">
              {DAYS.map((d, i) => (
                <button key={d} onClick={() => setRepeatByDay(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])} className={`w-8 h-8 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${repeatByDay.includes(i) ? 'bg-[#4D7C5D] text-white border-[#4D7C5D]' : 'bg-[#FAF8F5] dark:bg-[#282A30] text-slate-500 dark:text-slate-400 border-[#EFEBE4] dark:border-[#383A42] hover:border-[#C4D7B2]'}`}>
                  {d}
                </button>
              ))}
            </div>
          )}
          {/* Monthly position */}
          {repeatFreq === 'MONTHLY' && (
            <div className="flex items-center gap-2 mb-3">
              <select value={repeatBySetPos ?? 1} onChange={(e) => setRepeatBySetPos(parseInt(e.target.value))} className="bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#C4D7B2]">
                <option value={1}>第一个</option>
                <option value={2}>第二个</option>
                <option value={3}>第三个</option>
                <option value={4}>第四个</option>
                <option value={-1}>最后一个</option>
              </select>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">周</span>
              <select value={repeatByDay?.[0] ?? 1} onChange={(e) => setRepeatByDay([parseInt(e.target.value)])} className="bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#C4D7B2]">
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2 border-t border-[#EFEBE4] dark:border-[#33353A]">
            <button onClick={() => setShowRepeatModal(false)} className="text-[10px] px-3 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] transition-colors cursor-pointer font-bold">取消</button>
            <button onClick={handleConfirm} className="text-[10px] px-3 py-1.5 rounded-lg bg-[#4D7C5D] text-white font-bold hover:bg-[#3F684C] transition-colors cursor-pointer">确定</button>
          </div>
        </div>
      </div>
    );
  };

  if (compact) {
    // Super-compact inline addition bar (ideal for MatrixView quadrants)
    return (
      <form
        onSubmit={onSubmit}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full flex items-center gap-2 bg-white/70 dark:bg-[#1C1D21]/70 border border-[#EFEBE4] dark:border-[#33353A] px-3.5 py-2 rounded-xl hover:bg-white dark:hover:bg-[#23252B] hover:border-[#C4D7B2] dark:hover:border-[#4D7C5D] focus-within:border-[#4D7C5D] dark:focus-within:border-[#6FAD84] hover:shadow-xs transition-all duration-300"
      >
        <Plus className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
        <input
          type="text"
          placeholder={placeholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent border-none text-[11px] text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-semibold"
          required
        />
        <button type="submit" className="hidden" />
      </form>
    );
  }

// Natural language date input component
const NLPDateInput: React.FC<{ onParse: (date?: string, time?: string) => void }> = ({ onParse }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleConfirm = () => {
    const parsed = parseNaturalDate(text);
    if (parsed) {
      onParse(parsed.dueDate, parsed.dueTime);
      setText("");
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
        title="自然语言解析日期"
      >
        <Zap className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] rounded-xl shadow-lg p-2 animate-fade-in-up min-w-[200px]">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") setOpen(false); }}
              placeholder="明天下午3点 / 下周五"
              className="flex-grow bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#C4D7B2]"
            />
            <button
              type="button"
              onClick={handleConfirm}
              className="text-[10px] px-2 py-1 rounded-lg bg-[#4D7C5D] text-white font-bold hover:bg-[#3F684C] transition-colors cursor-pointer"
            >
              确定
            </button>
          </div>
          {text && (() => {
            const preview = parseNaturalDate(text);
            return preview ? (
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                → {formatNaturalPreview(preview)}
              </p>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
};

  // Standard inline quick add bar with inline expandable options
  return (
    <div 
      ref={containerRef}
      onPointerDown={(e) => e.stopPropagation()}
      className="w-full select-none"
    >
      <form
        onSubmit={onSubmit}
        className={`w-full flex flex-col gap-2 bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] rounded-2xl shadow-xs transition-all duration-300 ${
          isFocused ? "border-[#C4D7B2] dark:border-[#4D7C5D] shadow-sm ring-1 ring-[#C4D7B2]/30 dark:ring-[#4D7C5D]/30 p-3.5" : "px-4 py-2.5 hover:border-[#C4D7B2] dark:hover:border-[#4D7C5D]"
        }`}
      >
        <div className="flex items-center gap-3 w-full">
          <Plus className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
          <input
            type="text"
            placeholder={placeholder}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsFocused(true)}
            className="w-full bg-transparent border-none text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-semibold"
            required
          />
          
          {/* Collapsed view quick icons indicator */}
          {!isFocused && (
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 flex-shrink-0">
                <span className="text-[9px] font-bold bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4]/80 dark:border-[#383A42] px-2 py-0.5 rounded-lg flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            📅 {dueDate.split("-").slice(1).join("/")}{dueTime ? ` ${dueTime}` : ""}
                          </span>
            </div>
          )}
        </div>

        {/* Expanded options panel when focused */}
        {isFocused && (
          <div className="flex flex-col gap-2.5 pt-2.5 border-t border-[#FAF8F5] dark:border-[#282A30] animate-fade-in-up">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={q.descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4]/50 dark:border-[#383A42] px-3 py-1.5 rounded-xl text-[11px] text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] transition-colors"
              />
              <input
                type="text"
                placeholder={q.notesPlaceholder}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4]/50 dark:border-[#383A42] px-3 py-1.5 rounded-xl text-[11px] text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] transition-colors"
              />
            </div>
            
            {/* Tags */}
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag, i) => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-[#F0F5F1] dark:bg-[#232924] border border-[#DEEAE2] dark:border-[#38433B] text-[#4D7C5D] dark:text-[#6FAD84] font-bold flex items-center gap-1">
                  {tag}
                  <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} className="cursor-pointer hover:text-red-500">×</button>
                </span>
              ))}
              <input
                type="text"
                placeholder={tc.tagPlaceholder}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    if (!tags.includes(tagInput.trim())) {
                      setTags([...tags, tagInput.trim()]);
                    }
                    setTagInput("");
                  }
                }}
                className="bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4]/50 dark:border-[#383A42] px-2 py-1 rounded-xl text-[10px] text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] transition-colors w-28"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                {/* Due Date Input */}
                <div className="flex items-center gap-1.5 bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4]/50 dark:border-[#383A42] px-2.5 py-1 rounded-xl cursor-pointer">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="bg-transparent border-none text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none cursor-pointer"
                    title={q.dueDate}
                  />
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="bg-transparent border-none text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none cursor-pointer w-16"
                  />
                  {/* Natural Date Parser */}
                  <NLPDateInput onParse={(d, t) => { if (d) setDueDate(d); if (t) setDueTime(t); }} />
                </div>
                
                {/* Category Selector */}
                <div className="flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <CustomSelect
                    value={category}
                    onChange={setCategory}
                    options={PRIORITY_OPTIONS}
                    className="w-40 text-[10px]"
                    dropdownAlign="top"
                  />
                </div>

                {/* Priority Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{tc.priority}</span>
                  <CustomSelect
                    value={priority}
                    onChange={(v) => setPriority(v as TaskPriority)}
                    options={PRIORITY_LEVELS}
                    className="w-24 text-[10px]"
                    dropdownAlign="top"
                  />
                </div>
                {/* Repeat Selector */}
                <div className="flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <CustomSelect
                    value={repeat === "none" || repeat === "daily" || repeat === "weekly" || repeat === "monthly" ? repeat : "custom"}
                    onChange={(v) => {
                      if (v === "custom") { setShowRepeatModal(true); return; }
                      setRepeat(v);
                    }}
                    options={[
                      { value: "none", label: tc.repeatNone },
                      { value: "daily", label: tc.repeatDaily },
                      { value: "weekly", label: tc.repeatWeekly },
                      { value: "monthly", label: tc.repeatMonthly },
                      { value: "custom", label: "自定义..." },
                    ]}
                    className="w-28 text-[10px]"
                    dropdownAlign="top"
                  />
                  {repeat !== "none" && repeat !== "daily" && repeat !== "weekly" && repeat !== "monthly" && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#F0F5F1] dark:bg-[#232924] text-[#4D7C5D] dark:text-[#6FAD84] font-bold truncate max-w-[80px]">
                      {rruleToLabel(repeat)}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsFocused(false)}
                  className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] transition-colors cursor-pointer border border-[#EFEBE4]/60 dark:border-[#383A42]"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="bg-[#4D7C5D] hover:bg-[#3F684C] text-white px-4 py-1.5 rounded-xl text-[10px] font-bold shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  {q.add}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
      {showRepeatModal && <RepeatModal />}
    </div>
  );
});

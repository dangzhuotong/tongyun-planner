import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Command, CheckSquare, StickyNote, BookOpen, X, CornerDownLeft } from "lucide-react";
import { parseQuickCaptureInput, type ParsedCapture } from "../utils/quickCapture";
import { audioEngine } from "../utils/audioEngine";

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTask: (task: { title: string; category?: any; tags?: string[]; dueDate?: string }) => void;
  onAddNote: (text: string) => void;
  onAppendJournal: (text: string) => void;
  onToast: (msg: string) => void;
}

const QuickCaptureModalContent: React.FC<Omit<QuickCaptureModalProps, "isOpen">> = ({
  onClose,
  onAddTask,
  onAddNote,
  onAppendJournal,
  onToast,
}) => {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const parsed: ParsedCapture = parseQuickCaptureInput(text);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = parsed.content.trim();
    if (!trimmed) return;

    if (parsed.type === "note") {
      onAddNote(trimmed);
      audioEngine.playStickSound();
      onToast("✨ 已快速沉淀为便签！");
    } else if (parsed.type === "journal") {
      onAppendJournal(trimmed);
      audioEngine.playPaperSwipeSound();
      onToast("📖 已追加至今日手帐随想！");
    } else {
      onAddTask({
        title: trimmed,
        category: parsed.category,
        tags: parsed.tags,
        dueDate: parsed.dueDate,
      });
      audioEngine.playPencilScratchSound();
      onToast(`✓ 已录入为待办 [${parsed.category === "urgent-important" ? "重要且紧急" : "四象限"}]`);
    }

    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[130] flex items-start justify-center pt-28 bg-black/45 backdrop-blur-sm p-4 animate-fade-in select-none"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: -15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -15 }}
        transition={{ type: "spring", stiffness: 450, damping: 28 }}
        className="w-full max-w-xl bg-[#FDFBF7] dark:bg-[#1C1E24] border border-[#EBE5D8] dark:border-[#383A42] rounded-2xl shadow-2xl overflow-hidden relative text-[#2D323A] dark:text-slate-100"
      >
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* 输入主区域 */}
          <div className="flex items-center gap-3 px-2">
            <Command className="w-5 h-5 text-orange-500/80 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="极速捕捉灵感：直接输入存待办；// 存便签；.. 存日记..."
              className="w-full bg-transparent text-sm font-medium focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100"
            />
            {text && (
              <button
                type="button"
                onClick={() => setText("")}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              disabled={!parsed.content.trim()}
              className={`p-1.5 rounded-lg flex items-center justify-center transition-all ${
                parsed.content.trim()
                  ? "bg-[#4D7C5D] text-white shadow-xs cursor-pointer hover:bg-[#3D634A]"
                  : "bg-slate-100 dark:bg-[#282A30] text-slate-400 cursor-not-allowed"
              }`}
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 实时解析与智能类型指示条 */}
          <div className="pt-2 border-t border-[#EFEBE4] dark:border-[#282A30] flex items-center justify-between text-[11px] text-slate-400 px-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500 dark:text-slate-400">将保存为：</span>
              {parsed.type === "note" && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md font-bold">
                  <StickyNote className="w-3 h-3" />
                  <span>随想便签墙</span>
                </span>
              )}
              {parsed.type === "journal" && (
                <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md font-bold">
                  <BookOpen className="w-3 h-3" />
                  <span>今日日记随想</span>
                </span>
              )}
              {parsed.type === "task" && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[#4D7C5D] dark:text-[#78C496] bg-[#4D7C5D]/10 px-2 py-0.5 rounded-md font-bold">
                    <CheckSquare className="w-3 h-3" />
                    <span>四象限待办</span>
                  </span>
                  {parsed.dueDate && (
                    <span className="text-[10px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded font-mono">
                      📅 {parsed.dueDate}
                    </span>
                  )}
                  {parsed.tags?.map((t: string) => (
                    <span
                      key={t}
                      className="text-[10px] text-slate-500 bg-slate-100 dark:bg-[#282A30] px-1.5 py-0.5 rounded font-medium"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-400">
              <span>Enter 确认保存</span>
              <span>Esc 取消</span>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <QuickCaptureModalContent {...props} />;
};

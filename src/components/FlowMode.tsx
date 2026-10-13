import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { X, CheckCircle2, ListTodo } from "lucide-react";
import type { Task, PomodoroLog } from "../types";
import { getLocalDateString, filterHomeActionableTasks } from "../utils/date";
import { FocusHeatmap } from "./FocusHeatmap";

interface FlowModeProps {
  tasks: Task[];
  pomodoroLogs: PomodoroLog[];
  handleComplete: (id: string) => void;
  onExit: () => void;
}

export const FlowMode: React.FC<FlowModeProps> = ({
  tasks,
  pomodoroLogs,
  handleComplete,
  onExit,
}) => {
  const today = getLocalDateString();

  const queue = useMemo(() => filterHomeActionableTasks(tasks, today), [tasks, today]);

  const [completedCount, setCompletedCount] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTask = queue[0];
  const remaining = queue.length;

  const handleDone = useCallback(() => {
    if (!currentTask || showComplete) return;
    const taskId = currentTask.id;
    setCompletedCount((c) => c + 1);
    setShowComplete(true);
    timerRef.current = setTimeout(() => {
      handleComplete(taskId);
      setShowComplete(false);
    }, 600);
  }, [currentTask, showComplete, handleComplete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit();
      } else if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        handleDone();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onExit, handleDone]);

  if (queue.length === 0) {
    if (completedCount > 0) {
      return (
        <div className="fixed inset-0 z-[100] bg-[#FAF8F5] dark:bg-[#18191D] flex flex-col items-center justify-center animate-fade-in-up main-window-root">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#F0F5F1] dark:bg-[#1E2B23] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-[#4D7C5D] dark:text-[#78C496]" />
            </div>
            <h2 className="text-xl font-bold text-[#2D323A] dark:text-slate-100">全部完成！🎉</h2>
            <p className="text-sm text-slate-400 dark:text-slate-400 font-medium">
              今日 {completedCount} 个任务已全部完成
            </p>
            <button
              onClick={onExit}
              className="mt-4 px-6 py-2.5 rounded-xl bg-[#4D7C5D] text-white text-sm font-bold hover:bg-[#3F684C] transition-all cursor-pointer shadow-sm"
            >
              返回
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[100] bg-[#FAF8F5] dark:bg-[#18191D] flex flex-col items-center justify-center animate-fade-in-up main-window-root">
        <div className="text-center space-y-4">
          <span className="text-5xl block">🌿</span>
          <h2 className="text-xl font-bold text-slate-400 dark:text-slate-300">今天没有待办任务</h2>
          <button
            onClick={onExit}
            className="mt-4 px-6 py-2.5 rounded-xl bg-[#4D7C5D] text-white text-sm font-bold hover:bg-[#3F684C] transition-all cursor-pointer shadow-sm"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const getQuadColor = (category: Task["category"]) => {
    const colors: Record<string, string> = {
      "urgent-important": "bg-[#E8A0BF]",
      "important-not-urgent": "bg-[#C4D7B2]",
      "urgent-not-important": "bg-[#B2C8DF]",
      "not-urgent-not-important": "bg-[#E5DCC3]",
    };
    return colors[category] || "bg-[#E8A0BF]";
  };

  const getQuadLabel = (category: Task["category"]) => {
    const labels: Record<string, string> = {
      "urgent-important": "重要紧急",
      "important-not-urgent": "重要不紧急",
      "urgent-not-important": "紧急不重要",
      "not-urgent-not-important": "不重要不紧急",
    };
    return labels[category] || "";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#FAF8F5] dark:bg-[#18191D] flex flex-col animate-fade-in-up select-none main-window-root">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#EFEBE4] dark:border-[#2D3039]">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-400 dark:text-slate-400">
          <ListTodo className="w-4 h-4" />
          剩余 {remaining} 项
        </div>
        <button
          onClick={onExit}
          className="p-2 rounded-xl hover:bg-white/80 dark:hover:bg-[#252830] border border-transparent hover:border-[#EFEBE4] dark:hover:border-[#2D3039] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all cursor-pointer"
          title="退出沉浸模式 (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-grow flex flex-col px-8 overflow-y-auto">
        {/* 任务卡片：垂直居中 */}
        <div className="flex-grow flex items-center justify-center min-h-0">
          <div
            className={`max-w-lg w-full transition-all duration-500 ${showComplete ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
          >
            <div className={`w-2 h-2 rounded-full mb-4 ${getQuadColor(currentTask.category)}`} />
            <h1 className="text-3xl font-bold text-[#2D323A] dark:text-slate-100 leading-tight mb-4">
              {currentTask.title}
            </h1>
            {currentTask.description && (
              <p className="text-base text-slate-500 dark:text-slate-400 font-medium leading-relaxed mb-6">
                {currentTask.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-sm text-slate-400 dark:text-slate-400 font-medium">
              <span
                className={`text-[10px] font-black px-2 py-1 rounded-md text-white ${getQuadColor(currentTask.category)}`}
              >
                {getQuadLabel(currentTask.category)}
              </span>
              {currentTask.dueTime && <span>截止 {currentTask.dueTime}</span>}
            </div>

            <div className="mt-10 flex items-center gap-4">
              <button
                onClick={handleDone}
                className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-[#4D7C5D] text-white font-bold text-sm hover:bg-[#3F684C] transition-all shadow-md hover:shadow-lg cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-5 h-5" />
                完成
              </button>
              <button
                onClick={onExit}
                className="px-8 py-3.5 rounded-2xl border border-[#EFEBE4] dark:border-[#2D3039] bg-white dark:bg-[#202227] text-slate-500 dark:text-slate-300 font-bold text-sm hover:bg-[#FAF8F5] dark:hover:bg-[#282B33] transition-all cursor-pointer active:scale-95"
              >
                稍后处理
              </button>
            </div>

            <p className="mt-6 text-xs text-slate-400/80 dark:text-slate-500 font-medium">
              按{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                Space
              </kbd>{" "}
              或{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                Enter
              </kbd>{" "}
              完成 ·{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                Esc
              </kbd>{" "}
              退出
            </p>
          </div>
        </div>

        {/* 热力图：固定在底部 */}
        {pomodoroLogs.length > 0 && (
          <div className="flex-shrink-0 w-full max-w-2xl mx-auto pb-6 pt-4">
            <FocusHeatmap pomodoroLogs={pomodoroLogs} weeks={12} />
          </div>
        )}
      </div>
    </div>
  );
};

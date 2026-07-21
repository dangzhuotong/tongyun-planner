import React, { useState, useMemo, useEffect, useCallback } from "react";
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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [showComplete, setShowComplete] = useState(false);

  const currentTask = queue[currentIndex];
  const remaining = queue.length - currentIndex;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  const handleDone = useCallback(() => {
    if (!currentTask) return;
    handleComplete(currentTask.id);
    setCompletedCount((c) => c + 1);
    setShowComplete(true);
    setTimeout(() => {
      setShowComplete(false);
      setCurrentIndex((i) => i + 1);
    }, 600);
  }, [currentTask, handleComplete]);

  if (!currentTask && queue.length > 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#FAF8F5] flex flex-col items-center justify-center animate-fade-in-up">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#F0F5F1] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-[#4D7C5D]" />
          </div>
          <h2 className="text-xl font-bold text-[#2D323A]">全部完成！🎉</h2>
          <p className="text-sm text-slate-400 font-medium">今日 {completedCount} 个任务已全部完成</p>
          <button onClick={onExit} className="mt-4 px-6 py-2.5 rounded-xl bg-[#4D7C5D] text-white text-sm font-bold hover:bg-[#3F684C] transition-all cursor-pointer">
            返回
          </button>
        </div>
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#FAF8F5] flex flex-col items-center justify-center animate-fade-in-up">
        <div className="text-center space-y-4">
          <span className="text-5xl block">🌿</span>
          <h2 className="text-xl font-bold text-slate-400">今天没有待办任务</h2>
          <button onClick={onExit} className="mt-4 px-6 py-2.5 rounded-xl bg-[#4D7C5D] text-white text-sm font-bold hover:bg-[#3F684C] transition-all cursor-pointer">
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
    <div className="fixed inset-0 z-[100] bg-[#FAF8F5] flex flex-col animate-fade-in-up select-none">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#EFEBE4]">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-400">
          <ListTodo className="w-4 h-4" />
          剩余 {remaining} 项
        </div>
        <button
          onClick={onExit}
          className="p-2 rounded-xl hover:bg-white/80 border border-transparent hover:border-[#EFEBE4] text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-grow flex flex-col px-8 overflow-y-auto">
        {/* 任务卡片：垂直居中 */}
        <div className="flex-grow flex items-center justify-center min-h-0">
          <div className={`max-w-lg w-full transition-all duration-500 ${showComplete ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}>
            <div className={`w-1.5 h-1.5 rounded-full mb-4 ${getQuadColor(currentTask.category)}`} />
            <h1 className="text-3xl font-bold text-[#2D323A] leading-tight mb-4">
              {currentTask.title}
            </h1>
            {currentTask.description && (
              <p className="text-base text-slate-500 font-medium leading-relaxed mb-6">
                {currentTask.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-sm text-slate-400 font-medium">
              <span className={`text-[10px] font-black px-2 py-1 rounded-md text-white ${getQuadColor(currentTask.category)}`}>
                {getQuadLabel(currentTask.category)}
              </span>
              {currentTask.dueTime && (
                <span>截止 {currentTask.dueTime}</span>
              )}
            </div>

            <div className="mt-10 flex gap-4">
              <button
                onClick={handleDone}
                className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-[#4D7C5D] text-white font-bold text-sm hover:bg-[#3F684C] transition-all shadow-md hover:shadow-lg cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                完成
              </button>
              <button
                onClick={onExit}
                className="px-8 py-3.5 rounded-2xl border border-[#EFEBE4] bg-white text-slate-500 font-bold text-sm hover:bg-[#FAF8F5] transition-all cursor-pointer"
              >
                稍后处理
              </button>
            </div>
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

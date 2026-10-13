import React from "react";
import { Check, Undo2, Trash2, History } from "lucide-react";
import type { Task } from "../types";
import { useTranslation } from "../i18n/LanguageContext";

interface CompletedViewProps {
  completedTasks: Task[];
  handleClearCompleted: () => void;
  handleUndoComplete: (id: string) => void;
  handleDeleteTask: (id: string) => void;
}

export const CompletedView: React.FC<CompletedViewProps> = React.memo(
  ({ completedTasks, handleClearCompleted, handleUndoComplete, handleDeleteTask }) => {
    const { t } = useTranslation();
    const c = t.completed;
    return (
      <div className="rounded-2xl bg-white/80 dark:bg-[#1A1C20]/90 border border-[#EFEBE4] dark:border-[#2D3038] p-6 flex flex-col gap-4 flex-grow overflow-y-auto max-h-[480px] custom-scrollbar select-none shadow-xs transition-colors">
        <div className="flex justify-between items-center border-b border-[#EFEBE4] dark:border-[#2D3038] pb-3">
          <h3 className="text-xs font-bold text-[#4D7C5D] dark:text-[#6FAD84] tracking-wider uppercase flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>
              {c.title} ({completedTasks.length})
            </span>
          </h3>
          {completedTasks.length > 0 && (
            <button
              onClick={handleClearCompleted}
              className="text-[10px] text-red-500 dark:text-red-400 hover:bg-red-500 hover:text-white border border-red-200 dark:border-red-900/60 px-2.5 py-1.5 rounded-lg bg-transparent transition-all font-bold cursor-pointer hover:shadow-xs active:scale-95"
            >
              {c.clearAll}
            </button>
          )}
        </div>
        {completedTasks.length > 0 ? (
          <div className="space-y-2 pr-1 custom-scrollbar">
            {completedTasks.map((task) => (
              <div
                key={task.id}
                className="p-3.5 rounded-xl bg-[#F0F5F1]/30 dark:bg-[#1C251F]/40 border border-[#DEEAE2]/50 dark:border-[#26382C]/60 flex justify-between items-center hover:bg-[#F0F5F1]/60 dark:hover:bg-[#1C251F]/70 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-grow">
                  <div className="w-5 h-5 rounded-full bg-[#C4D7B2]/20 dark:bg-[#4D7C5D]/25 flex items-center justify-center border border-[#C4D7B2]/40 dark:border-[#4D7C5D]/40 text-[#4D7C5D] dark:text-[#6FAD84] shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 line-through decoration-slate-300 dark:decoration-slate-600 truncate">
                      {task.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.description && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium truncate">
                          {task.description}
                        </p>
                      )}
                      {task.dueDate && (
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium shrink-0">
                          📅 {task.dueDate}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={() => handleUndoComplete(task.id)}
                    className="text-xs hover:text-[#A34E36] dark:hover:text-[#F87171] border border-[#EFEBE4] dark:border-[#33353A] hover:bg-[#FCF2F0]/60 dark:hover:bg-[#3D1F24]/50 p-2 rounded-xl bg-transparent text-slate-400 dark:text-slate-500 transition-all cursor-pointer hover:scale-105 active:scale-95"
                    title={c.undo}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-xs hover:text-red-500 dark:hover:text-red-400 border border-[#EFEBE4] dark:border-[#33353A] hover:bg-red-50/60 dark:hover:bg-red-950/40 p-2 rounded-xl bg-transparent text-slate-400 dark:text-slate-500 transition-all cursor-pointer hover:scale-105 active:scale-95"
                    title={c.permanentDelete}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 flex flex-col items-center gap-3">
            <History className="w-12 h-12 text-[#EFEBE4] dark:text-[#2E313A]" />
            <p className="text-sm text-slate-400 dark:text-slate-500 font-bold">{c.empty}</p>
          </div>
        )}
      </div>
    );
  },
);

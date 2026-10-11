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
      <div className="rounded-2xl bg-white/70 border border-[#EFEBE4] p-6 flex flex-col gap-4 flex-grow overflow-y-auto max-h-[480px] custom-scrollbar select-none">
        <div className="flex justify-between items-center border-b border-[#EFEBE4] pb-3">
          <h3 className="text-xs font-bold text-[#4D7C5D] tracking-wider uppercase">
            {c.title} ({completedTasks.length})
          </h3>
          {completedTasks.length > 0 && (
            <button
              onClick={handleClearCompleted}
              className="text-[10px] text-red-500 hover:bg-red-500 hover:text-white border border-red-200 px-2.5 py-1.5 rounded-lg bg-transparent transition-all font-bold cursor-pointer"
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
                className="p-4 rounded-xl bg-[#F0F5F1]/30 border border-[#DEEAE2]/50 flex justify-between items-center hover:bg-[#F0F5F1]/60 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#C4D7B2]/20 flex items-center justify-center border border-[#C4D7B2]/30 text-[#4D7C5D]">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-500 line-through decoration-slate-300">
                      {task.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.description && (
                        <p className="text-xs text-slate-400 font-medium">{task.description}</p>
                      )}
                      {task.dueDate && (
                        <span className="text-[9px] text-slate-400 font-medium">
                          📅 {task.dueDate}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUndoComplete(task.id)}
                    className="text-xs hover:text-[#A34E36] border border-[#EFEBE4] hover:bg-[#FCF2F0]/50 p-2.5 rounded-xl bg-transparent text-slate-400 transition-all cursor-pointer"
                    title={c.undo}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-xs hover:text-red-500 border border-[#EFEBE4] hover:bg-red-50/50 p-2.5 rounded-xl bg-transparent text-slate-400 transition-all cursor-pointer"
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
            <History className="w-12 h-12 text-[#EFEBE4]" />
            <p className="text-sm text-slate-400 font-bold">{c.empty}</p>
          </div>
        )}
      </div>
    );
  },
);

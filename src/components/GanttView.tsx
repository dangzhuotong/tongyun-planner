import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Task } from "../types";
import { getLocalDateString, addLocalDays } from "../utils/date";

interface GanttViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export const GanttView: React.FC<GanttViewProps> = React.memo(({ tasks, onTaskClick }) => {
  const [startOffset, setStartOffset] = useState(0);
  const [zoom, setZoom] = useState<"day" | "week">("week");

  const today = getLocalDateString();

  const ganttData = useMemo(() => {
    const withDates = tasks.filter(t => t.dueDate);
    const sorted = [...withDates].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    return sorted.slice(0, 100); // cap for performance
  }, [tasks]);

  const dayCount = zoom === "week" ? 28 : 14;
  const days: string[] = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < dayCount; i++) {
      result.push(addLocalDays(today, startOffset * dayCount + i));
    }
    return result;
  }, [startOffset, dayCount]);

  const dayHeaders = days.map(d => {
    const date = new Date(d);
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    return { date: d, day: date.getDate(), weekday, isToday: d === today, isWeekend: date.getDay() === 0 || date.getDay() === 6 };
  });

  return (
    <div className="animate-fade-in-up flex flex-col gap-3 flex-grow z-10 relative select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#8B6E3C] tracking-widest uppercase">项目时间线</span>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => setZoom("week")} className={`text-[9px] px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer ${zoom === "week" ? "bg-[#4D7C5D] text-white" : "bg-[#FAF8F5] text-slate-500 hover:bg-[#F0F5F1]"}`}>月</button>
            <button onClick={() => setZoom("day")} className={`text-[9px] px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer ${zoom === "day" ? "bg-[#4D7C5D] text-white" : "bg-[#FAF8F5] text-slate-500 hover:bg-[#F0F5F1]"}`}>周</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setStartOffset(prev => prev - 1)} className="p-1 rounded-lg hover:bg-[#FAF8F5] transition-colors cursor-pointer text-slate-400"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button onClick={() => setStartOffset(0)} className="text-[9px] px-2 py-1 rounded-lg bg-[#FAF8F5] text-slate-500 hover:bg-[#F0F5F1] transition-colors cursor-pointer font-bold">今天</button>
          <button onClick={() => setStartOffset(prev => prev + 1)} className="p-1 rounded-lg hover:bg-[#FAF8F5] transition-colors cursor-pointer text-slate-400"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="bg-white/90 border border-[#EFEBE4] rounded-2xl overflow-hidden shadow-sm ">
        <div className="overflow-x-auto custom-scrollbar" style={{ maxHeight: "60vh" }}>
          <div className="min-w-[600px]">
            {/* Header row */}
            <div className="flex border-b border-[#EFEBE4] bg-[#FAF8F5]/80 sticky top-0 z-10">
              <div className="w-48 flex-shrink-0 px-3 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-r border-[#EFEBE4]">任务</div>
              {dayHeaders.map(h => (
                <div key={h.date} className={`flex-1 text-center px-1 py-2 text-[8px] font-bold border-r border-[#EFEBE4]/50 last:border-r-0 ${h.isToday ? 'bg-[#F0F5F1] text-[#4D7C5D]' : h.isWeekend ? 'text-[#D4380D]/50' : 'text-slate-400'}`}>
                  <div>{h.weekday}</div>
                  <div>{h.day}</div>
                </div>
              ))}
            </div>
            {/* Task rows */}
            {ganttData.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-[10px] text-slate-400 font-bold">没有带日期的任务</div>
            ) : (
              ganttData.map((task, idx) => {
                return (
                  <div key={task.id} className={`flex items-center border-b border-[#EFEBE4]/50 last:border-b-0 hover:bg-[#FAF8F5]/50 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white/30' : ''}`} onClick={() => onTaskClick(task)}>
                    <div className="w-48 flex-shrink-0 px-3 py-2 text-[10px] text-slate-700 font-medium truncate border-r border-[#EFEBE4] flex items-center gap-1.5">
                      {task.isPinned && <span className="text-[8px]">📌</span>}
                      <span className="truncate">{task.title}</span>
                    </div>
                    {days.map((d) => {
                      const isActive = task.dueDate === d;
                      const isToday = d === today;
                      return (
                        <div key={d} className={`flex-1 relative border-r border-[#EFEBE4]/50 last:border-r-0 ${isToday ? 'bg-[#F0F5F1]/30' : ''}`} style={{ minHeight: 28 }}>
                          {isActive && (
                            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 mx-1 h-4 rounded-md bg-[#C4D7B2]/80 border border-[#A8C8A0] flex items-center justify-center" title={task.title}>
                              <span className="text-[6px] text-[#3D6A4F] font-bold truncate px-1">{task.dueTime || ''}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

import React, { useMemo, useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  GripHorizontal,
  Link,
  Search,
  Filter,
} from "lucide-react";
import type { Task } from "../types";
import { getLocalDateString, addLocalDays } from "../utils/date";

interface GanttViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onEditTask?: (id: string, updates: Partial<Task>) => void;
}

export const GanttView: React.FC<GanttViewProps> = React.memo(
  ({ tasks, onTaskClick, onEditTask }) => {
    const [startOffset, setStartOffset] = useState(0);
    const [zoom, setZoom] = useState<"day" | "week">("week");
    const [searchQuery, setSearchQuery] = useState("");
    const draggedTaskIdRef = useRef<string | null>(null);
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
    const [dragOverDate, setDragOverDate] = useState<string | null>(null);

    const today = getLocalDateString();

    const ganttData = useMemo(() => {
      let withDates = tasks.filter((t) => t.dueDate);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        withDates = withDates.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.description && t.description.toLowerCase().includes(q))
        );
      }
      const sorted = [...withDates].sort((a, b) =>
        (a.dueDate || "").localeCompare(b.dueDate || "")
      );
      return sorted.slice(0, 100); // cap for performance
    }, [tasks, searchQuery]);

    const dayCount = zoom === "week" ? 28 : 14;
    const days: string[] = useMemo(() => {
      const result: string[] = [];
      for (let i = 0; i < dayCount; i++) {
        result.push(addLocalDays(today, startOffset * dayCount + i));
      }
      return result;
    }, [startOffset, dayCount, today]);

    const dayHeaders = days.map((d) => {
      const date = new Date(d);
      const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
      return {
        date: d,
        day: date.getDate(),
        weekday,
        isToday: d === today,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      };
    });

    // Handle Drag and Drop for rescheduling task due dates
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
      e.stopPropagation();
      draggedTaskIdRef.current = taskId;
      setDraggedTaskId(taskId);
      try {
        e.dataTransfer.setData("text/plain", taskId);
        e.dataTransfer.setData("text", taskId);
      } catch { /* dataTransfer not supported */ }
      e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, dateStr: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverDate !== dateStr) {
        setDragOverDate(dateStr);
      }
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, targetDate: string) => {
      e.preventDefault();
      setDragOverDate(null);
      const dataId = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text");
      const taskId = dataId || draggedTaskIdRef.current || draggedTaskId;
      if (taskId && onEditTask) {
        onEditTask(taskId, { dueDate: targetDate });
      }
      draggedTaskIdRef.current = null;
      setDraggedTaskId(null);
    };

    return (
      <div className="animate-fade-in-up flex flex-col gap-3 flex-grow z-10 relative select-none">
        {/* Controls Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/80 p-3 rounded-2xl border border-[#EFEBE4] shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#4D7C5D] tracking-wide flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>甘特图项目时间线</span>
            </span>

            {/* Zoom Toggle */}
            <div className="flex items-center gap-1 bg-[#FAF8F5] border border-[#EFEBE4] p-0.5 rounded-xl">
              <button
                onClick={() => setZoom("week")}
                className={`text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  zoom === "week"
                    ? "bg-[#4D7C5D] text-white shadow-2xs"
                    : "text-slate-500 hover:bg-white"
                }`}
              >
                月跨度 (28天)
              </button>

              <button
                onClick={() => setZoom("day")}
                className={`text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  zoom === "day"
                    ? "bg-[#4D7C5D] text-white shadow-2xs"
                    : "text-slate-500 hover:bg-white"
                }`}
              >
                双周跨度 (14天)
              </button>
            </div>
          </div>

          {/* Search Input & Date Offset Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="筛选项目任务..."
                className="pl-8 pr-3 py-1 bg-[#FAF8F5] border border-[#EFEBE4] rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] w-36 sm:w-48 transition-all"
              />
            </div>

            <div className="flex items-center gap-1 bg-[#FAF8F5] border border-[#EFEBE4] p-0.5 rounded-xl">
              <button
                onClick={() => setStartOffset((prev) => prev - 1)}
                className="p-1 rounded-lg hover:bg-white text-slate-500 transition-colors cursor-pointer"
                title="向前平移"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => setStartOffset(0)}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-white text-[#4D7C5D] font-bold shadow-2xs cursor-pointer border border-[#EFEBE4]"
              >
                回到今天
              </button>

              <button
                onClick={() => setStartOffset((prev) => prev + 1)}
                className="p-1 rounded-lg hover:bg-white text-slate-500 transition-colors cursor-pointer"
                title="向后平移"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tip Hint */}
        <div className="text-[10px] text-slate-400 font-medium px-1 flex items-center gap-1">
          <GripHorizontal className="w-3 h-3 text-[#4D7C5D]" />
          <span>提示：可以直接按住甘特图中的任务绿色区块，拖拽放置到任意日期网格上以重新安排截止时间。</span>
        </div>

        {/* Gantt Timeline Board Table */}
        <div className="bg-white/90 border border-[#EFEBE4] rounded-2xl overflow-hidden shadow-xs relative">
          <div
            className="overflow-x-auto custom-scrollbar"
            style={{ maxHeight: "62vh" }}
          >
            <div className="min-w-[720px] relative">
              {/* Header row */}
              <div className="flex border-b border-[#EFEBE4] bg-[#FAF8F5]/90 sticky top-0 z-20 backdrop-blur-md">
                <div className="w-52 flex-shrink-0 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-[#EFEBE4]">
                  任务标题 ({ganttData.length})
                </div>

                {dayHeaders.map((h) => (
                  <div
                    key={h.date}
                    className={`flex-1 text-center px-1 py-1.5 text-[9px] font-bold border-r border-[#EFEBE4]/50 last:border-r-0 ${
                      h.isToday
                        ? "bg-[#F0F5F1] text-[#4D7C5D]"
                        : h.isWeekend
                        ? "text-[#D4380D]/60"
                        : "text-slate-400"
                    }`}
                  >
                    <div>{h.weekday}</div>
                    <div className="font-mono text-[10px]">{h.day}</div>
                  </div>
                ))}
              </div>

              {/* Task rows */}
              {ganttData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-400 font-bold gap-2">
                  <Filter className="w-6 h-6 text-slate-300" />
                  <span>没有找到包含截止日期的待办任务</span>
                </div>
              ) : (
                ganttData.map((task, idx) => {
                  const hasDependencies =
                    task.dependsOn && task.dependsOn.length > 0;

                  return (
                    <div
                      key={task.id}
                      className={`flex items-center border-b border-[#EFEBE4]/50 last:border-b-0 hover:bg-[#FAF8F5]/60 transition-colors ${
                        idx % 2 === 0 ? "bg-white/30" : ""
                      }`}
                    >
                      {/* Left Task Title Cell */}
                      <div
                        onClick={() => onTaskClick(task)}
                        className="w-52 flex-shrink-0 px-3 py-2 text-xs text-slate-700 font-bold truncate border-r border-[#EFEBE4] flex items-center gap-1.5 cursor-pointer hover:text-[#4D7C5D]"
                        title={task.title}
                      >
                        {task.isPinned && (
                          <span className="text-[10px]">📌</span>
                        )}
                        <span className="truncate flex-grow">{task.title}</span>

                        {hasDependencies && (
                          <span
                            className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 shrink-0 flex items-center gap-0.5"
                            title="该任务存在依赖前置项"
                          >
                            <Link className="w-2.5 h-2.5" />
                            {task.dependsOn!.length}
                          </span>
                        )}
                      </div>

                      {/* Right Timeline Grid Cells */}
                      {days.map((d) => {
                        const isActive = task.dueDate === d;
                        const isToday = d === today;
                        const isHovered = dragOverDate === d;

                        return (
                          <div
                            key={d}
                            onDragOver={(e) => handleDragOver(e, d)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, d)}
                            className={`flex-1 relative border-r border-[#EFEBE4]/40 last:border-r-0 transition-colors ${
                              isToday ? "bg-[#F0F5F1]/40" : ""
                            } ${isHovered ? "bg-[#C4D7B2]/30 ring-1 ring-[#4D7C5D] ring-inset" : ""}`}
                            style={{ minHeight: 32 }}
                          >
                            {/* Today Vertical Line Indicator */}
                            {isToday && (
                              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#4D7C5D]/30 pointer-events-none" />
                            )}

                            {/* Active Task Drag Block Bar */}
                            {isActive && (
                              <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, task.id)}
                                onClick={() => onTaskClick(task)}
                                className="absolute left-1 right-1 top-1/2 -translate-y-1/2 h-5 rounded-md bg-[#4D7C5D] hover:bg-[#3F684C] text-white border border-[#3F684C] flex items-center justify-between px-1.5 shadow-2xs cursor-grab active:cursor-grabbing transition-all hover:scale-102 group/bar z-10"
                                title={`点击查看详情，拖拽调整日期。截止时间: ${
                                  task.dueTime || "全天"
                                }`}
                              >
                                <span className="text-[9px] font-bold truncate">
                                  {task.title}
                                </span>

                                {task.dueTime && (
                                  <span className="text-[8px] font-mono bg-white/20 px-1 rounded text-white shrink-0 ml-1">
                                    {task.dueTime}
                                  </span>
                                )}
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
  }
);

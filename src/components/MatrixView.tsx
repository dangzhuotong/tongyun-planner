import React, { useMemo, useState } from "react";
import { Search, Heart, Calendar, Clock, Check, Layers3, Maximize2, Minimize2, Repeat, ListTodo } from "lucide-react";
import type { Task, TaskCategory } from "../types";
import { PLANNER_COLORS, getDueDateCountdown, PRIORITY_META } from "../constants";
import { QuickAddTask } from "./QuickAddTask";
import { useTranslation } from "../i18n/LanguageContext";

interface MatrixViewProps {
  tasks: Task[];
  handleComplete: (id: string) => void;
  qColors?: {
    "urgent-important": string;
    "important-not-urgent": string;
    "urgent-not-important": string;
    "not-urgent-not-important": string;
  };
  handleStartFocus: (taskId: string, taskTitle: string) => void;
  handleAddTask: (taskData: {
    title: string;
    description: string;
    notes: string;
    category: Task["category"];
    dueDate: string;
    dueTime?: string;
    isExplicit?: boolean;
  }) => void;
  handleToggleFavorite: (id: string) => void;
  handleTogglePin: (id: string) => void;
  onTaskClick?: (task: Task) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
}

export const MatrixView: React.FC<MatrixViewProps> = React.memo(({ 
  tasks, 
  handleComplete, 
  qColors, 
  handleStartFocus,
  handleAddTask,
  handleToggleFavorite,
  handleTogglePin,
  onTaskClick,
  searchQuery,
  setSearchQuery,
}) => {
  const { t } = useTranslation();
  const lv = t.listView;
  const tc = t.taskCard;
  const m = t.matrix;
  // State to support full screen expand/collapse for a specific quadrant
  const [expandedQuadrant, setExpandedQuadrant] = useState<TaskCategory | null>(null);

  const quadrants = useMemo(() => [
    {
      id: "urgent-important",
      label: "I. " + m.urgentImportant,
      defaultBg: "bg-[#FCF2F0]",
      defaultBorder: "border-[#F5DFDB]",
      defaultText: "text-[#A34E36]",
      defaultDot: "bg-[#E8A0BF]",
      icon: <Heart className="w-3 h-3" />,
    },
    {
      id: "important-not-urgent",
      label: "II. " + m.importantNotUrgent,
      defaultBg: "bg-[#F0F5F1]",
      defaultBorder: "border-[#DEEAE2]",
      defaultText: "text-[#4D7C5D]",
      defaultDot: "bg-[#C4D7B2]",
      icon: <Calendar className="w-3 h-3" />,
    },
    {
      id: "urgent-not-important",
      label: "III. " + m.urgentNotImportant,
      defaultBg: "bg-[#F3F2F7]",
      defaultBorder: "border-[#E5E2EE]",
      defaultText: "text-[#5C528B]",
      defaultDot: "bg-[#B2C8DF]",
      icon: <Clock className="w-3 h-3" />,
    },
    {
      id: "not-urgent-not-important",
      label: "IV. " + m.notUrgentNotImportant,
      defaultBg: "bg-[#FAF5ED]",
      defaultBorder: "border-[#EFE5D3]",
      defaultText: "text-[#8B6E3C]",
      defaultDot: "bg-[#F5EBEB]",
      icon: <Layers3 className="w-3 h-3" />,
    },
  ] as const, [m.importantNotUrgent, m.notUrgentNotImportant, m.urgentImportant, m.urgentNotImportant]);

  // Filter quadrants if one is maximized
  const activeQuadrants = useMemo(() => (
    expandedQuadrant
      ? quadrants.filter((q) => q.id === expandedQuadrant)
      : quadrants
  ), [expandedQuadrant, quadrants]);

  // Local search when not provided from parent
  const [localSearch, setLocalSearch] = useState("");
  const effectiveQuery = searchQuery !== undefined ? searchQuery : localSearch;
  const effectiveSetQuery = setSearchQuery || setLocalSearch;

  const tasksByQuadrant = useMemo(() => {
    const query = effectiveQuery.toLowerCase();
    const grouped: Record<TaskCategory, Task[]> = {
      "urgent-important": [],
      "important-not-urgent": [],
      "urgent-not-important": [],
      "not-urgent-not-important": [],
    };

    tasks.forEach((task) => {
      const matchesSearch = !query ||
        task.title.toLowerCase().includes(query) ||
        (task.description || "").toLowerCase().includes(query) ||
        (task.notes || "").toLowerCase().includes(query);

      if (matchesSearch) grouped[task.category].push(task);
    });

    Object.values(grouped).forEach((items) => {
      items.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });
    });

    return grouped;
  }, [effectiveQuery, tasks]);

  return (
    <div className="animate-fade-in-up select-none flex-grow flex flex-col gap-4">
      {/* Search bar */}
      <div className="relative flex-shrink-0">
        <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder={lv.search}
          value={effectiveQuery}
          onChange={(e) => effectiveSetQuery(e.target.value)}
          className="w-full bg-white/90 border border-[#EFEBE4] pl-10 pr-4 py-2.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] transition-colors font-semibold "
        />
      </div>
      <div 
        className={`flex-grow ${
          expandedQuadrant ? "flex flex-col" : "grid grid-cols-2 gap-4"
        }`}
      >
      {activeQuadrants.map((quad) => {
        const quadrantTasks = tasksByQuadrant[quad.id];

        const colorKey = qColors ? qColors[quad.id] : null;
        const customColor = colorKey ? PLANNER_COLORS[colorKey] : null;

        const bgClass = customColor ? customColor.bg : quad.defaultBg;
        const borderClass = customColor ? customColor.border : quad.defaultBorder;
        const textClass = customColor ? customColor.text : quad.defaultText;

        return (
          <div
            key={quad.id}
            className={`rounded-2xl border ${borderClass} ${bgClass} shadow-[0_8px_20px_-8px_rgba(154,142,128,0.08)] transition-all duration-300 p-5 flex flex-col gap-3 relative overflow-hidden ${
              expandedQuadrant 
                ? "flex-grow min-h-[460px] shadow-md border-[#C4D7B2]" 
                : "min-h-[220px] max-h-[300px] hover:-translate-y-0.5"
            }`}
          >
            {/* Quadrant Header */}
            <div className={`flex items-center justify-between border-b ${borderClass} pb-2 z-10`}>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-md ${bgClass} flex items-center justify-center border ${borderClass} ${textClass}`}>
                  {quad.icon}
                </div>
                <span className={`text-xs font-bold ${textClass} tracking-wider`}>
                  {quad.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] ${bgClass} border ${borderClass} ${textClass} px-2.5 py-0.5 rounded-full font-bold`}>
                    {m.taskCount.replace("{count}", String(quadrantTasks.length))}
                </span>
                
                {/* Maximize / Collapse toggle buttons */}
                <button
                  onClick={() => setExpandedQuadrant(expandedQuadrant ? null : quad.id)}
                  className={`p-1 rounded-lg hover:bg-white/75 transition-colors border ${borderClass} text-slate-400 hover:text-slate-600 cursor-pointer`}
                  title={expandedQuadrant ? m.collapse : m.expand}
                >
                  {expandedQuadrant ? (
                    <Minimize2 className="w-3 h-3" />
                  ) : (
                    <Maximize2 className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {/* Inline Quick Add Component (Context-Aware) */}
            <div className="z-10">
              <QuickAddTask
                handleAddTask={(data) => handleAddTask({ ...data, isExplicit: true })}
                defaultCategory={quad.id}
                compact={true}
                placeholder={m.addPlaceholder.replace("{quadrant}", quad.label.split(" ").slice(1).join(""))}
              />
            </div>

            {/* Task list container */}
            <div 
              className={`flex-grow space-y-2 overflow-y-auto pr-1 z-10 custom-scrollbar ${
                expandedQuadrant ? "max-h-[380px]" : "max-h-[190px]"
              }`}
            >
              {quadrantTasks.length > 0 ? (
                quadrantTasks.map((task) => {
                  const countdown = getDueDateCountdown(task.dueDate, task.dueTime);
                  const isOverdue = countdown?.isOverdue;
                  const cardBg = isOverdue ? "bg-[#FCF2F0]/50" : "bg-white/70";
                  const cardBorder = isOverdue ? "border-[#F5DFDB]" : borderClass;
                  return (
                    <div
                      key={task.id}
                      className={`p-2 py-2.5 px-3 rounded-xl ${cardBg} border ${cardBorder} hover:border-slate-300 hover:bg-white hover:shadow-xs transition-all duration-300 flex justify-between items-center gap-3 relative overflow-hidden group`}
                    >
                      <div className="min-w-0 flex-grow">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {task.isPinned && (
                            <span className="text-[10px] text-[#8B6E3C] flex-shrink-0" title={m.pinned}>📌</span>
                          )}
                          <h4
                            className={`text-xs font-bold text-[#2D323A] group-hover:${textClass} transition-colors truncate cursor-pointer hover:underline`}
                            onClick={() => onTaskClick?.(task)}
                          >
                            {task.title}
                          </h4>
                          {task.isFavorite && (
                            <span className="text-[10px] text-[#E8A0BF] flex-shrink-0" title={m.starred}>♥</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                          {task.description && (
                            <p className="text-[9.5px] text-slate-500 truncate flex-grow min-w-0">{task.description}</p>
                          )}
                          
                          {/* Elegant Non-wrapping Pill Badge for Due Date */}
                          {countdown && (
                            (() => {
                              const badgeStyle = countdown.isOverdue
                                ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] font-extrabold"
                                : countdown.isToday
                                ? "bg-[#FBECE5] border-[#F6DCD2] text-[#A64424] font-extrabold"
                                : "bg-[#FAF8F5] border-[#EFEBE4] text-slate-500 font-semibold";
                              return (
                                <span className={`text-[8.5px] px-1.5 py-0.5 rounded-lg border flex items-center gap-1 flex-shrink-0 whitespace-nowrap ${badgeStyle}`}>
                                  📅 {task.dueDate?.split("-").slice(1).join("/")}{task.dueTime ? ` ${task.dueTime}` : ""} ({countdown.text})
                                </span>
                              );
                            })()
                          )}

                          {task.repeat && task.repeat !== "none" && (
                            <span className="text-[8.5px] px-1.5 py-0.5 rounded-lg border bg-[#F0F5F1] border-[#DEEAE2] text-[#4D7C5D] font-bold flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                              <Repeat className="w-2.5 h-2.5" />
                              <span>{tc["repeat" + task.repeat.charAt(0).toUpperCase() + task.repeat.slice(1)]}</span>
                            </span>
                          )}

                          {task.subtasks && task.subtasks.length > 0 && (
                            <span className="text-[8.5px] px-1.5 py-0.5 rounded-lg border bg-[#FAF5ED] border-[#EFE5D3] text-[#8B6E3C] font-bold flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                              <ListTodo className="w-2.5 h-2.5" />
                              <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                            </span>
                          )}
                          {task.tags && task.tags.length > 0 && task.tags.map((tag) => (
                            <span key={tag} className="text-[8.5px] px-1.5 py-0.5 rounded-md bg-[#F0F5F1] border border-[#DEEAE2] text-[#4D7C5D] font-bold flex-shrink-0">
                              {tag}
                            </span>
                          ))}
                          {task.priority && PRIORITY_META[task.priority] && (
                            <span
                              title={`${tc.priority}: ${t.taskCard["priority" + (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) as "priorityHigh"]}`}
                              className={`text-[8.5px] px-1.5 py-0.5 rounded-lg border border-[#EFEBE4] font-bold flex items-center gap-1 flex-shrink-0 whitespace-nowrap ${PRIORITY_META[task.priority].text}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_META[task.priority].dot}`} />
                              {PRIORITY_META[task.priority].label}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Hover Actions: Only visible on row hover */}
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                        {/* Pin Toggle Button */}
                        <button
                          onClick={() => handleTogglePin(task.id)}
                          className="p-1 rounded hover:bg-slate-100 flex-shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
                          title={task.isPinned ? m.unpin : m.pin}
                        >
                          <svg className={`w-3.5 h-3.5 ${task.isPinned ? "text-[#8B6E3C] fill-[#8B6E3C]" : "text-slate-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </button>

                        {/* Favorite Toggle Button */}
                        <button
                          onClick={() => handleToggleFavorite(task.id)}
                          className="p-1 rounded hover:bg-slate-100 flex-shrink-0 cursor-pointer text-slate-400"
                          title={task.isFavorite ? m.unfavorite : m.favorite}
                        >
                          <Heart className={`w-3.5 h-3.5 text-[#E8A0BF] transition-all ${task.isFavorite ? "fill-[#E8A0BF]" : "text-slate-300"}`} />
                        </button>

                        <button
                          onClick={() => handleStartFocus(task.id, task.title)}
                          className="p-1 rounded hover:bg-slate-100 flex-shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
                          title={m.startFocus}
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleComplete(task.id)}
                          className="p-1 rounded hover:bg-slate-100 flex-shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
                          title={m.complete}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex items-center justify-center py-12 text-slate-400 text-[10px] font-bold tracking-wider">
                  {t.listView.noTasks}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
});

import React, { useMemo, useState } from "react";
import {
  Search,
  Heart,
  Clock,
  Check,
  Layers3,
  Maximize2,
  Minimize2,
  Repeat,
  ListTodo,
  Zap,
  Target,
  Info,
} from "lucide-react";
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
  onEditTask?: (id: string, updates: Partial<Task>) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
}

export const MatrixView: React.FC<MatrixViewProps> = React.memo(
  ({
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

    // Fullscreen expand/collapse for a specific quadrant
    const [expandedQuadrant, setExpandedQuadrant] = useState<TaskCategory | null>(null);
    const [showMethodologyHelp, setShowMethodologyHelp] = useState(false);

    const quadrants = useMemo(
      () =>
        [
          {
            id: "urgent-important",
            label: "I. " + m.urgentImportant,
            strategy: "立即执行 (Do First)",
            desc: "紧急且关键，需要立刻投入专注解决。",
            defaultBg: "bg-[#FCF2F0] dark:bg-[#2B2123]",
            defaultBorder: "border-[#F5DFDB] dark:border-[#422D30]",
            defaultText: "text-[#A34E36] dark:text-[#E06D53]",
            defaultDot: "bg-[#E8A0BF]",
            icon: <Zap className="w-3.5 h-3.5" />,
          },
          {
            id: "important-not-urgent",
            label: "II. " + m.importantNotUrgent,
            strategy: "计划安排 (Schedule)",
            desc: "高价值长期目标，决定成败与核心成长，需设定明确 Deadline。",
            defaultBg: "bg-[#F0F5F1] dark:bg-[#212923]",
            defaultBorder: "border-[#DEEAE2] dark:border-[#2D3A31]",
            defaultText: "text-[#4D7C5D] dark:text-[#6FAD84]",
            defaultDot: "bg-[#C4D7B2]",
            icon: <Target className="w-3.5 h-3.5" />,
          },
          {
            id: "urgent-not-important",
            label: "III. " + m.urgentNotImportant,
            strategy: "快速处理/委派 (Delegate)",
            desc: "干扰项居多，尽量快速批处理或自动化解决。",
            defaultBg: "bg-[#F3F2F7] dark:bg-[#25232E]",
            defaultBorder: "border-[#E5E2EE] dark:border-[#353242]",
            defaultText: "text-[#5C528B] dark:text-[#8D82C4]",
            defaultDot: "bg-[#B2C8DF]",
            icon: <Clock className="w-3.5 h-3.5" />,
          },
          {
            id: "not-urgent-not-important",
            label: "IV. " + m.notUrgentNotImportant,
            strategy: "精简/删除 (Eliminate)",
            desc: "低价值消耗项，控制耗时，能不做就不做。",
            defaultBg: "bg-[#FAF5ED] dark:bg-[#2B2721]",
            defaultBorder: "border-[#EFE5D3] dark:border-[#3E372E]",
            defaultText: "text-[#8B6E3C] dark:text-[#CBB182]",
            defaultDot: "bg-[#F5EBEB]",
            icon: <Layers3 className="w-3.5 h-3.5" />,
          },
        ] as const,
      [m.importantNotUrgent, m.notUrgentNotImportant, m.urgentImportant, m.urgentNotImportant]
    );

    const activeQuadrants = useMemo(
      () =>
        expandedQuadrant
          ? quadrants.filter((q) => q.id === expandedQuadrant)
          : quadrants,
      [expandedQuadrant, quadrants]
    );

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
        const matchesSearch =
          !query ||
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

    // Total tasks count for ratio calculation
    const totalMatchingTasks = useMemo(() => {
      return Object.values(tasksByQuadrant).reduce((acc, cur) => acc + cur.length, 0);
    }, [tasksByQuadrant]);

    return (
      <div className="animate-fade-in-up select-none flex-grow flex flex-col gap-4 md:gap-5">
        {/* Top Control Bar: Search */}
        <div className="flex flex-wrap items-center justify-between gap-3.5 bg-white/80 dark:bg-[#1C1D21]/90 p-3.5 px-4 rounded-2xl border border-[#EFEBE4] dark:border-[#33353A] shadow-xs">
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={lv.search}
              value={effectiveQuery}
              onChange={(e) => effectiveSetQuery(e.target.value)}
              className="w-full bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] pl-10 pr-4 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] font-semibold transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMethodologyHelp(!showMethodologyHelp)}
              className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-[#4D7C5D] dark:hover:text-[#6FAD84] font-bold px-3.5 py-2 rounded-xl border border-[#EFEBE4] dark:border-[#383A42] bg-[#FAF8F5] dark:bg-[#282A30] cursor-pointer transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              <span>象限法则法则指引</span>
            </button>
          </div>
        </div>

        {/* Methodology Tip Drawer */}
        {showMethodologyHelp && (
          <div className="bg-[#FAF8F5] dark:bg-[#23252B] border border-[#EFEBE4] dark:border-[#383A42] p-4.5 sm:p-5 rounded-2xl text-xs text-slate-600 dark:text-slate-300 space-y-2.5 animate-fade-in">
            <div className="font-bold text-[#2D323A] dark:text-slate-100 flex items-center justify-between pb-1 border-b border-[#EFEBE4] dark:border-[#33353A]">
              <span className="flex items-center gap-1.5 text-[#4D7C5D] dark:text-[#6FAD84] text-xs">
                <Target className="w-4 h-4" />
                <span>艾森豪威尔矩阵 (Eisenhower Matrix) 执行建议</span>
              </span>
              <button
                onClick={() => setShowMethodologyHelp(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] leading-relaxed pt-1">
              <div className="p-3 rounded-xl bg-white dark:bg-[#1C1D21] border border-[#F5DFDB] dark:border-[#422D30]">
                <strong className="text-[#A34E36] dark:text-[#E06D53]">第一象限 (重要且紧急)：</strong> 危机与限期任务。立即专注执行，避免过度堆积导致疲惫。
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#1C1D21] border border-[#DEEAE2] dark:border-[#2D3A31]">
                <strong className="text-[#4D7C5D] dark:text-[#6FAD84]">第二象限 (重要不紧急)：</strong> 高价值成长区。人生核心目标与规划，应分配最多的时间精力。
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#1C1D21] border border-[#E5E2EE] dark:border-[#353242]">
                <strong className="text-[#5C528B] dark:text-[#8D82C4]">第三象限 (紧急不重要)：</strong> 琐碎干扰。批处理、委派他人或借助 AI 工具快速搞定。
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#1C1D21] border border-[#EFE5D3] dark:border-[#3E372E]">
                <strong className="text-[#8B6E3C] dark:text-[#CBB182]">第四象限 (不紧急不重要)：</strong> 低价值消耗。记录并控制耗时，能不做就不做。
              </div>
            </div>
          </div>
        )}

        {/* Matrix Quadrants Grid */}
        <div
          className={`flex-grow ${
            expandedQuadrant ? "flex flex-col" : "grid grid-cols-1 md:grid-cols-2 gap-3.5"
          }`}
        >
          {activeQuadrants.map((quad) => {
            const quadrantTasks = tasksByQuadrant[quad.id];
            const colorKey = qColors ? qColors[quad.id] : null;
            const customColor = colorKey ? PLANNER_COLORS[colorKey] : null;

            const bgClass = customColor ? customColor.bg : quad.defaultBg;
            const borderClass = customColor ? customColor.border : quad.defaultBorder;
            const textClass = customColor ? customColor.text : quad.defaultText;

            const percentage =
              totalMatchingTasks > 0
                ? Math.round((quadrantTasks.length / totalMatchingTasks) * 100)
                : 0;

            return (
              <div
                key={quad.id}
                className={`rounded-2xl border ${borderClass} ${bgClass} shadow-2xs transition-all duration-300 p-4 flex flex-col gap-2.5 relative overflow-hidden ${
                  expandedQuadrant
                    ? "flex-grow min-h-[480px] shadow-md"
                    : "min-h-[230px] max-h-[340px] hover:-translate-y-0.5"
                }`}
              >
                {/* Quadrant Header */}
                <div
                  className={`flex items-center justify-between border-b ${borderClass} pb-3 z-10`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-xl ${bgClass} flex items-center justify-center border ${borderClass} ${textClass} shrink-0 shadow-2xs`}
                    >
                      {quad.icon}
                    </div>
                    <div>
                      <span className={`text-xs font-bold ${textClass} tracking-wider block leading-none`}>
                        {quad.label}
                      </span>
                      <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-medium mt-1 block">
                        {quad.strategy}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9.5px] ${bgClass} border ${borderClass} ${textClass} px-2.5 py-0.5 rounded-full font-bold font-mono`}
                      title={`占总任务比重 ${percentage}%`}
                    >
                      {m.taskCount.replace("{count}", String(quadrantTasks.length))} ({percentage}%)
                    </span>

                    {/* Maximize / Collapse toggle buttons */}
                    <button
                      onClick={() =>
                        setExpandedQuadrant(expandedQuadrant ? null : quad.id)
                      }
                      className={`p-1.5 rounded-lg hover:bg-white/80 dark:hover:bg-[#1C1D21]/80 transition-colors border ${borderClass} text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer`}
                      title={expandedQuadrant ? m.collapse : m.expand}
                    >
                      {expandedQuadrant ? (
                        <Minimize2 className="w-3.5 h-3.5" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Inline Quick Add Component */}
                <div className="z-10">
                  <QuickAddTask
                    handleAddTask={(data) =>
                      handleAddTask({ ...data, isExplicit: true })
                    }
                    defaultCategory={quad.id}
                    compact={true}
                    placeholder={m.addPlaceholder.replace(
                      "{quadrant}",
                      quad.label.split(" ").slice(1).join("")
                    )}
                  />
                </div>

                {/* Task list container */}
                <div
                  className={`flex-grow space-y-2.5 overflow-y-auto pr-1 z-10 custom-scrollbar ${
                    expandedQuadrant ? "max-h-[520px]" : "max-h-[360px]"
                  }`}
                >
                  {quadrantTasks.length > 0 ? (
                    quadrantTasks.map((task) => {
                      const countdown = getDueDateCountdown(
                        task.dueDate,
                        task.dueTime
                      );
                      const isOverdue = countdown?.isOverdue;
                      const cardBg = isOverdue
                        ? "bg-[#FCF2F0]/90 dark:bg-[#2F2123]"
                        : "bg-white/90 dark:bg-[#1C1D21]/95";
                      const cardBorder = isOverdue
                        ? "border-[#F5DFDB] dark:border-[#422D30]"
                        : borderClass;

                      const hasBadges =
                        countdown ||
                        (task.repeat && task.repeat !== "none") ||
                        (task.subtasks && task.subtasks.length > 0) ||
                        (task.tags && task.tags.length > 0) ||
                        (task.priority && PRIORITY_META[task.priority]);

                      return (
                        <div
                          key={task.id}
                          className={`p-3 rounded-xl ${cardBg} border ${cardBorder} hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-[#22242A] hover:shadow-xs transition-all duration-200 flex flex-col gap-1.5 relative overflow-hidden group`}
                        >
                          {/* Row 1: Header (Title + Hover Actions) */}
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 flex-grow">
                              {task.isPinned && (
                                <span
                                  className="text-[10px] text-[#8B6E3C] shrink-0"
                                  title={m.pinned}
                                >
                                  📌
                                </span>
                              )}
                              <h4
                                className={`text-xs font-bold text-[#2D323A] dark:text-slate-100 group-hover:${textClass} transition-colors truncate cursor-pointer hover:underline`}
                                onClick={() => onTaskClick?.(task)}
                              >
                                {task.title}
                              </h4>
                              {task.isFavorite && (
                                <span
                                  className="text-[10px] text-[#E8A0BF] shrink-0"
                                  title={m.starred}
                                >
                                  ♥
                                </span>
                              )}
                            </div>

                            {/* Hover Actions */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                              <button
                                onClick={() => handleTogglePin(task.id)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                title={task.isPinned ? m.unpin : m.pin}
                              >
                                <svg
                                  className={`w-3.5 h-3.5 ${
                                    task.isPinned
                                      ? "text-[#8B6E3C] fill-[#8B6E3C]"
                                      : "text-slate-300"
                                  }`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                  />
                                </svg>
                              </button>

                              <button
                                onClick={() => handleToggleFavorite(task.id)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer text-slate-400"
                                title={
                                  task.isFavorite ? m.unfavorite : m.favorite
                                }
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 text-[#E8A0BF] transition-all ${
                                    task.isFavorite
                                      ? "fill-[#E8A0BF]"
                                      : "text-slate-300"
                                  }`}
                                />
                              </button>

                              <button
                                onClick={() =>
                                  handleStartFocus(task.id, task.title)
                                }
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                title={m.startFocus}
                              >
                                <Clock className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleComplete(task.id)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                title={m.complete}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Description (if present) */}
                          {task.description && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {/* Row 3: Badges (if present) */}
                          {hasBadges && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {/* Due Date Badge */}
                              {countdown &&
                                (() => {
                                  const badgeStyle = countdown.isOverdue
                                    ? "bg-[#FCF2F0] dark:bg-[#3D2325] border-[#F5DFDB] dark:border-[#422D30] text-[#A34E36] dark:text-[#E06D53] font-extrabold"
                                    : countdown.isToday
                                    ? "bg-[#FBECE5] dark:bg-[#382723] border-[#F6DCD2] dark:border-[#4D2E28] text-[#A64424] dark:text-[#E57C58] font-extrabold"
                                    : "bg-[#FAF8F5] dark:bg-[#282A30] border-[#EFEBE4] dark:border-[#383A42] text-slate-500 dark:text-slate-400 font-semibold";
                                  return (
                                    <span
                                      className={`text-[8.5px] px-2 py-0.5 rounded-lg border flex items-center gap-1 shrink-0 whitespace-nowrap ${badgeStyle}`}
                                    >
                                      📅{" "}
                                      {task.dueDate
                                        ?.split("-")
                                        .slice(1)
                                        .join("/")}
                                      {task.dueTime ? ` ${task.dueTime}` : ""}{" "}
                                      ({countdown.text})
                                    </span>
                                  );
                                })()}

                              {task.repeat && task.repeat !== "none" && (
                                <span className="text-[8.5px] px-2 py-0.5 rounded-lg border bg-[#F0F5F1] dark:bg-[#232924] border-[#DEEAE2] dark:border-[#38433B] text-[#4D7C5D] dark:text-[#6FAD84] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap">
                                  <Repeat className="w-2.5 h-2.5" />
                                  <span>
                                    {
                                      tc[
                                        ("repeat" +
                                          task.repeat.charAt(0).toUpperCase() +
                                          task.repeat.slice(1)) as "repeatDaily"
                                      ]
                                    }
                                  </span>
                                </span>
                              )}

                              {task.subtasks && task.subtasks.length > 0 && (() => {
                                const done = task.subtasks.filter((s) => s.completed).length;
                                const total = task.subtasks.length;
                                const pct = Math.round((done / total) * 100);
                                return (
                                  <span className="text-[8.5px] px-2 py-0.5 rounded-lg border bg-[#FAF5ED] dark:bg-[#2B2721] border-[#EFE5D3] dark:border-[#3E372E] text-[#8B6E3C] dark:text-[#CBB182] font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                                    <ListTodo className="w-2.5 h-2.5" />
                                    <span>{done}/{total}</span>
                                    <span className="w-8 h-1 rounded-full bg-[#EFE5D3] dark:bg-[#3E372E] overflow-hidden">
                                      <span className="block h-full rounded-full bg-[#8B6E3C] dark:bg-[#CBB182] transition-all duration-300" style={{ width: `${pct}%` }} />
                                    </span>
                                  </span>
                                );
                              })()}

                              {task.tags &&
                                task.tags.length > 0 &&
                                task.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[8.5px] px-2 py-0.5 rounded-md bg-[#F0F5F1] dark:bg-[#232924] border border-[#DEEAE2] dark:border-[#38433B] text-[#4D7C5D] dark:text-[#6FAD84] font-bold shrink-0"
                                  >
                                    {tag}
                                  </span>
                                ))}

                              {task.priority && PRIORITY_META[task.priority] && (
                                <span
                                  title={`${tc.priority}: ${
                                    t.taskCard[
                                      ("priority" +
                                        (task.priority.charAt(0).toUpperCase() +
                                          task.priority.slice(1))) as "priorityHigh"
                                    ]
                                  }`}
                                  className={`text-[8.5px] px-2 py-0.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap ${
                                    PRIORITY_META[task.priority].text
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      PRIORITY_META[task.priority].dot
                                    }`}
                                  />
                                  {PRIORITY_META[task.priority].label}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full flex items-center justify-center py-10 text-slate-400 dark:text-slate-500 text-[10px] font-bold tracking-wider">
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
  }
);

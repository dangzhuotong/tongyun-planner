import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Calendar, Coffee, Plus, Trash2 } from "lucide-react";
import type { Task, TimeBlock } from "../types";
import { QuickAddTask } from "./QuickAddTask";
import { useTranslation } from "../i18n/LanguageContext";
import LunarLib from "lunar-javascript";
import { getLocalDateString } from "../utils/date";
import { safeJsonParse } from "../utils/json";
import { createId } from "../utils/id";
import { usePersonal } from "../context/PersonalContext";

const FIXED_FESTIVALS: Record<string, string> = {
  "01-01": "元旦",
  "05-01": "劳动节",
  "10-01": "国庆节",
  "12-25": "圣诞节",
};

interface CalendarViewProps {
  tasks: Task[];
  handleComplete: (id: string) => void;
  handleAddTask: (taskData: {
    title: string;
    description: string;
    notes: string;
    category: Task["category"];
    dueDate: string;
    dueTime?: string;
    isExplicit?: boolean;
  }) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = React.memo(
  ({ tasks, handleComplete, handleAddTask }) => {
    const {
      calendarYear,
      setCalendarYear,
      calendarMonth,
      setCalendarMonth,
      selectedCalendarDate,
      setSelectedCalendarDate,
    } = usePersonal();
    const { t } = useTranslation();
    const cv = t.calendarView;
    const m = t.matrix;
    // Pre-group tasks by due date using useMemo to convert O(N) filters to O(1) lookups
    const tasksByDueDate = useMemo(() => {
      const map: Record<string, Task[]> = {};
      tasks.forEach((task) => {
        if (task.dueDate) {
          if (!map[task.dueDate]) {
            map[task.dueDate] = [];
          }
          map[task.dueDate].push(task);
        }
      });
      return map;
    }, [tasks]);

    // 联网获取节假日数据（含调休），缓存在 localStorage
    const [holidayData, setHolidayData] = useState<Record<string, string>>({});
    useEffect(() => {
      const cacheKey = `tongyun_holidays_v2_${calendarYear}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setHolidayData(safeJsonParse(cached, {}));
          return;
        }
      } catch {
        /* ignore cache error */
      }
      fetch(`https://timor.tech/api/holiday/year/${calendarYear}`)
        .then((r) => r.json())
        .then((data: any) => {
          if (data.code === 0 && data.holiday) {
            const map: Record<string, string> = {};
            for (const [date, info] of Object.entries(data.holiday)) {
              const entry = info as any;
              const key = `${calendarYear}-${date}`;
              map[key] = entry.holiday ? `休:${entry.name}` : `班:${entry.name}`;
            }
            localStorage.setItem(cacheKey, JSON.stringify(map));
            setHolidayData(map);
          }
        })
        .catch(() => {});
    }, [calendarYear]);

    // 时间块规划
    const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() =>
      safeJsonParse(localStorage.getItem("tongyun_timeblocks") || "[]", []),
    );
    const [showTimeBlockInput, setShowTimeBlockInput] = useState(false);
    const [newBlockTitle, setNewBlockTitle] = useState("");
    const [newBlockStart, setNewBlockStart] = useState("09:00");
    const [newBlockEnd, setNewBlockEnd] = useState("10:00");

    useEffect(() => {
      localStorage.setItem("tongyun_timeblocks", JSON.stringify(timeBlocks));
    }, [timeBlocks]);

    const selectedDateBlocks = useMemo(
      () =>
        timeBlocks
          .filter((b) => b.date === selectedCalendarDate)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      [timeBlocks, selectedCalendarDate],
    );

    const addTimeBlock = () => {
      if (!newBlockTitle.trim()) return;
      const block: TimeBlock = {
        id: createId("tb"),
        date: selectedCalendarDate,
        startTime: newBlockStart,
        endTime: newBlockEnd,
        title: newBlockTitle.trim(),
        color: "#C4D7B2",
      };
      setTimeBlocks((prev) => [...prev, block]);
      setNewBlockTitle("");
      setShowTimeBlockInput(false);
    };

    const deleteTimeBlock = (id: string) => {
      setTimeBlocks((prev) => prev.filter((b) => b.id !== id));
    };

    const getDayMeta = useCallback(
      (dateStr: string) => {
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const entry = holidayData[dateStr];
        if (entry) {
          const [type, ...nameParts] = entry.split(":");
          const name = nameParts.join(":");
          return {
            type: type as "休" | "班",
            label: type,
            name,
            isWeekend,
          };
        }
        // 固定节日兜底 (如圣诞节)
        const fixedName = FIXED_FESTIVALS[dateStr.slice(5)];
        if (fixedName) {
          return { type: "休" as const, label: "休", name: fixedName, isWeekend };
        }
        if (isWeekend) {
          return { type: "weekend" as const, label: "休", name: "周末", isWeekend: true };
        }
        return { type: "workday" as const, label: "" as const, name: "", isWeekend: false };
      },
      [holidayData],
    );

    const getLunarDate = (dateStr: string) => {
      try {
        const [y, m, d] = dateStr.split("-").map(Number);
        const solar = LunarLib.Solar.fromYmd(y, m, d);
        const lunar = solar.getLunar();
        return {
          month: lunar.getMonthInChinese(),
          day: lunar.getDayInChinese(),
          year: lunar.getYearInChinese(),
          full: `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
        };
      } catch {
        return null;
      }
    };

    const renderDayDots = useCallback(
      (dateStr: string) => {
        const dayTasks = tasksByDueDate[dateStr] || [];
        if (dayTasks.length === 0) return null;

        return dayTasks
          .slice(0, 3)
          .map((t) => (
            <span
              key={t.id}
              className={`w-1 h-1 rounded-full ${
                t.category === "urgent-important"
                  ? "bg-[#E8A0BF]"
                  : t.category === "important-not-urgent"
                    ? "bg-[#C4D7B2]"
                    : t.category === "urgent-not-important"
                      ? "bg-[#B2C8DF]"
                      : "bg-[#F5EBEB]"
              }`}
            />
          ));
      },
      [tasksByDueDate],
    );

    const dayGrid = useMemo(() => {
      const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
      const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
      const prevMonthTotalDays = new Date(calendarYear, calendarMonth, 0).getDate();

      const elements: React.ReactNode[] = [];

      // 1. 上月余留天数填充
      for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevMonthTotalDays - i;
        const prevMonth = calendarMonth === 0 ? 11 : calendarMonth - 1;
        const prevYear = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
        const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const prevMeta = getDayMeta(dateStr);
        elements.push(
          <button
            key={`prev-${dayNum}`}
            onClick={() => setSelectedCalendarDate(dateStr)}
            className={`h-11 rounded-xl text-[10px] font-bold text-slate-300 dark:text-slate-600 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] transition-all flex flex-col items-center justify-between py-1 border border-transparent cursor-pointer ${selectedCalendarDate === dateStr ? "bg-[#FAF8F5] dark:bg-[#282A30] border-[#EFEBE4] dark:border-[#383A42]" : ""}`}
          >
            <span className="flex items-center gap-0.5">
              {prevMeta.label && <span className="text-[4px] opacity-40">{prevMeta.label}</span>}
              <span>{dayNum}</span>
            </span>
            <div className="flex gap-0.5 justify-center w-full min-h-[4px]">
              {renderDayDots(dateStr)}
            </div>
          </button>,
        );
      }

      // 2. 本月天数渲染
      const todayStr = getLocalDateString();
      for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedCalendarDate;
        const meta = getDayMeta(dateStr);

        let cellStyle =
          "bg-white dark:bg-[#202227] border-[#FAF8F5] dark:border-[#282A30] text-slate-700 dark:text-slate-200";
        let badgeText = "";
        let badgeStyle = "";
        if (meta.type === "休") {
          cellStyle =
            "bg-[#FFF5F3] dark:bg-[#331D1A] border-[#FFD9D0] dark:border-[#4D2822] text-[#D4380D] dark:text-[#F06A4B]";
          badgeText = "休";
          badgeStyle = "bg-[#D4380D] text-white";
        } else if (meta.type === "班") {
          cellStyle =
            "bg-[#FAFAFA] dark:bg-[#24272E] border-[#E8E4DE] dark:border-[#353A45] text-slate-500 dark:text-slate-400";
          badgeText = "班";
          badgeStyle = "bg-slate-400 text-white";
        } else if (meta.type === "weekend") {
          cellStyle =
            "bg-[#FFF9F5] dark:bg-[#2A231F] border-[#F5EDE8] dark:border-[#3D332D] text-[#B88A6B] dark:text-[#D1A88A]";
          badgeText = "休";
          badgeStyle = "bg-[#B88A6B]/70 text-white";
        }
        if (isToday)
          cellStyle =
            "bg-[#F0F5F1] dark:bg-[#212E24] border-[#C4D7B2] dark:border-[#3C5B43] text-[#4D7C5D] dark:text-[#6FAD84] font-extrabold";
        if (isSelected)
          cellStyle =
            "bg-[#FCF2F0]/80 dark:bg-[#3A2225] border-[#F5DFDB] dark:border-[#522D33] text-[#A34E36] dark:text-[#E27760]";

        elements.push(
          <button
            key={`curr-${dayNum}`}
            onClick={() => setSelectedCalendarDate(dateStr)}
            className={`h-11 rounded-xl text-[10px] font-bold transition-all flex flex-col items-center justify-between py-1 border cursor-pointer ${cellStyle}`}
            title={meta.name || undefined}
          >
            <span className="relative leading-none flex items-center justify-center w-full gap-0.5">
              {badgeText && (
                <span
                  className={`text-[5px] px-1 rounded-sm font-extrabold leading-none py-0.5 ${badgeStyle}`}
                >
                  {badgeText}
                </span>
              )}
              <span>{dayNum}</span>
            </span>
            <div className="flex gap-0.5 justify-center w-full min-h-[4px]">
              {meta.type === "休" || meta.type === "班" ? (
                <span className="text-[5px] text-inherit font-bold truncate max-w-[28px] leading-none opacity-60">
                  {meta.name.length > 3 ? meta.name.slice(0, 3) : meta.name}
                </span>
              ) : (
                renderDayDots(dateStr)
              )}
            </div>
          </button>,
        );
      }

      // 3. 下月起始填充
      const gridRemaining = 42 - elements.length;
      for (let dayNum = 1; dayNum <= gridRemaining; dayNum++) {
        const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
        const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
        const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const nextMeta = getDayMeta(dateStr);
        elements.push(
          <button
            key={`next-${dayNum}`}
            onClick={() => setSelectedCalendarDate(dateStr)}
            className={`h-11 rounded-xl text-[10px] font-bold text-slate-300 dark:text-slate-600 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] transition-all flex flex-col items-center justify-between py-1 border border-transparent cursor-pointer ${selectedCalendarDate === dateStr ? "bg-[#FAF8F5] dark:bg-[#282A30] border-[#EFEBE4] dark:border-[#383A42]" : ""}`}
          >
            <span className="flex items-center gap-0.5">
              {nextMeta.label && <span className="text-[4px] opacity-40">{nextMeta.label}</span>}
              <span>{dayNum}</span>
            </span>
            <div className="flex gap-0.5 justify-center w-full min-h-[4px]">
              {renderDayDots(dateStr)}
            </div>
          </button>,
        );
      }

      return elements;
    }, [
      calendarYear,
      calendarMonth,
      selectedCalendarDate,
      getDayMeta,
      renderDayDots,
      setSelectedCalendarDate,
    ]);

    const selectedDayTasks = tasksByDueDate[selectedCalendarDate] || [];

    return (
      <div className="animate-fade-in-up flex flex-col gap-4 flex-grow z-10 relative select-none">
        <div className="grid grid-cols-3 gap-6 flex-grow">
          {/* 月历网格页 */}
          <div className="col-span-2 rounded-2xl bg-white/90 dark:bg-[#1E2025]/95 border border-[#EFEBE4] dark:border-[#33353A] p-5 flex flex-col shadow-sm min-h-[420px]">
            {/* 日历导航 */}
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEBE4] dark:border-[#33353A] mb-4">
              <h3 className="text-sm font-bold text-[#2D323A] dark:text-slate-100 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#4D7C5D] dark:text-[#6DAF7E]" />
                <span>
                  {cv.yearMonth
                    .replace("{year}", String(calendarYear))
                    .replace("{month}", String(calendarMonth + 1))}
                </span>
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear((y) => y - 1);
                    } else {
                      setCalendarMonth((m) => m - 1);
                    }
                  }}
                  className="p-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#33353A] hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                  title={cv.prevMonth}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    setCalendarYear(today.getFullYear());
                    setCalendarMonth(today.getMonth());
                    setSelectedCalendarDate(getLocalDateString(today));
                  }}
                  className="text-[10px] px-3 py-1.5 rounded-lg bg-[#4D7C5D] hover:bg-[#3D6A4F] text-white font-extrabold transition-all cursor-pointer shadow-sm"
                >
                  {cv.backToToday}
                </button>
                <button
                  onClick={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear((y) => y + 1);
                    } else {
                      setCalendarMonth((m) => m + 1);
                    }
                  }}
                  className="p-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#33353A] hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                  title={cv.nextMonth}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* 星期行标 */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold uppercase tracking-wider mb-2">
              <span className="text-[#D4380D]/60 dark:text-[#F06A4B]/80">{cv.sun}</span>
              <span className="text-slate-400 dark:text-slate-500">{cv.mon}</span>
              <span className="text-slate-400 dark:text-slate-500">{cv.tue}</span>
              <span className="text-slate-400 dark:text-slate-500">{cv.wed}</span>
              <span className="text-slate-400 dark:text-slate-500">{cv.thu}</span>
              <span className="text-slate-400 dark:text-slate-500">{cv.fri}</span>
              <span className="text-[#D4380D]/60 dark:text-[#F06A4B]/80">{cv.sat}</span>
            </div>

            {/* 日期格子容器 */}
            <div className="grid grid-cols-7 gap-2 flex-grow">{dayGrid}</div>
          </div>

          {/* 右侧面板: 上=当日信息 下=待办列 */}
          <div className="rounded-2xl bg-white/90 dark:bg-[#1E2025]/95 border border-[#EFEBE4] dark:border-[#33353A] shadow-sm flex flex-col overflow-hidden max-h-[480px]">
            {/* 上: 当日信息 */}
            <div className="p-5 pb-0">
              <div className="bg-[#FAF8F5] dark:bg-[#26282E] rounded-xl p-4 border border-transparent dark:border-[#33353A]/40">
                <div className="relative flex items-start justify-between">
                  <div>
                    <h4 className="text-[11px] font-extrabold text-[#2D323A] dark:text-slate-100">
                      {new Date(selectedCalendarDate).toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                      })}
                    </h4>
                    {(() => {
                      const lunar = getLunarDate(selectedCalendarDate);
                      if (!lunar) return null;
                      return (
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5 tracking-wide">
                          {lunar.full}
                        </p>
                      );
                    })()}
                  </div>
                  {(() => {
                    const meta = getDayMeta(selectedCalendarDate);
                    if (meta.type === "workday") return null;
                    const config: Record<
                      string,
                      { bg: string; text: string; icon: string; label: string }
                    > = {
                      休: { bg: "bg-[#D4380D]", text: "text-white", icon: "🎉", label: "休" },
                      班: { bg: "bg-slate-400", text: "text-white", icon: "📅", label: "班" },
                      weekend: {
                        bg: "bg-[#B88A6B]/70",
                        text: "text-white",
                        icon: "🌤",
                        label: "休",
                      },
                    };
                    const c = config[meta.type];
                    return (
                      <span
                        className={`${c.bg} ${c.text} text-[9px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1`}
                      >
                        <span>{c.icon}</span>
                        {c.label}
                      </span>
                    );
                  })()}
                </div>
                {(() => {
                  const meta = getDayMeta(selectedCalendarDate);
                  if (!meta.name) return null;
                  return (
                    <div className="mt-2 text-[9px] text-slate-500 font-bold leading-relaxed">
                      {meta.type === "休" && `📌 ${meta.name}`}
                      {meta.type === "班" && `📌 ${meta.name}，今天上班`}
                      {meta.type === "weekend" && "📌 周末休息"}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="border-t border-[#EFEBE4] dark:border-[#33353A] mx-5 my-3" />

            {/* 下: 待办列 */}
            <div className="px-5 pb-5 flex-grow flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[10px] font-extrabold text-[#8B6E3C] dark:text-[#E2C799] tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-[#8B6E3C] dark:text-[#E2C799]" />
                  <span>{cv.tasksForDate.replace("{date}", selectedCalendarDate)}</span>
                </h3>
              </div>

              {/* 时间块 */}
              {selectedDateBlocks.length > 0 && (
                <div className="mb-2 space-y-1">
                  {selectedDateBlocks.map((block) => (
                    <div
                      key={block.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#F0F5F1]/60 dark:bg-[#252830] border border-[#DEEAE2] dark:border-[#33353A] group"
                    >
                      <div
                        className="w-1 h-6 rounded-full flex-shrink-0"
                        style={{ backgroundColor: block.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-[#2D323A] dark:text-slate-200 truncate">
                          {block.title}
                        </p>
                        <p className="text-[8px] text-slate-400 font-medium">
                          {block.startTime} - {block.endTime}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteTimeBlock(block.id)}
                        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 单日列表循环 */}
              <div className="flex-grow overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                {selectedDayTasks.length > 0 ? (
                  selectedDayTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl bg-[#FAF8F5]/60 dark:bg-[#26282E]/60 border border-[#EFEBE4]/75 dark:border-[#33353A] flex justify-between items-center gap-2 group hover:bg-[#FAF8F5] dark:hover:bg-[#26282E] transition-all"
                    >
                      <div className="min-w-0 flex-grow">
                        <h4 className="text-[11px] font-bold text-[#2D323A] dark:text-slate-200 truncate">
                          {task.title}
                        </h4>
                        {task.description && (
                          <p className="text-[8px] text-slate-400 truncate mt-0.5">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleComplete(task.id)}
                        className="text-[8px] flex-shrink-0 text-[#4D7C5D] dark:text-[#78C496] hover:bg-[#4D7C5D] hover:text-white border border-[#DEEAE2] dark:border-[#33353A] px-2 py-0.5 rounded bg-white dark:bg-[#1E2025] transition-all font-bold cursor-pointer"
                      >
                        {m.complete}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 gap-2">
                    <Coffee className="w-7 h-7 text-[#8B6E3C]/30 dark:text-[#E2C799]/30" />
                    <p className="text-[9px] text-slate-400 font-bold leading-normal">
                      {cv.noTasks}
                      <br />
                      {cv.enjoyDay}
                    </p>
                  </div>
                )}
              </div>

              {/* 添加时间块 */}
              {showTimeBlockInput ? (
                <div className="mt-2 p-2 rounded-xl bg-[#FAF8F5] dark:bg-[#26282E] border border-[#EFEBE4] dark:border-[#33353A] space-y-1.5 animate-fade-in-up">
                  <input
                    type="text"
                    value={newBlockTitle}
                    onChange={(e) => setNewBlockTitle(e.target.value)}
                    placeholder="时间块名称"
                    className="w-full bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] font-medium"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={newBlockStart}
                      onChange={(e) => setNewBlockStart(e.target.value)}
                      className="bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] w-20"
                    />
                    <span className="text-[9px] text-slate-400">至</span>
                    <input
                      type="time"
                      value={newBlockEnd}
                      onChange={(e) => setNewBlockEnd(e.target.value)}
                      className="bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] w-20"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowTimeBlockInput(false)}
                      className="text-[9px] px-2 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#33353A] text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#33353A] transition-colors cursor-pointer font-bold"
                    >
                      取消
                    </button>
                    <button
                      onClick={addTimeBlock}
                      className="text-[9px] px-2 py-1 rounded-lg bg-[#4D7C5D] text-white font-bold hover:bg-[#3F684C] transition-colors cursor-pointer"
                    >
                      添加
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowTimeBlockInput(true)}
                  className="mt-2 flex items-center gap-1 text-[9px] text-slate-400 hover:text-[#4D7C5D] dark:hover:text-[#78C496] transition-colors cursor-pointer font-medium"
                >
                  <Plus className="w-3 h-3" /> 添加时间块
                </button>
              )}

              {/* 极速行内添加栏 */}
              <div className="mt-2.5">
                <QuickAddTask
                  handleAddTask={handleAddTask}
                  defaultDueDate={selectedCalendarDate}
                  compact={true}
                  placeholder={cv.quickAddPlaceholder}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

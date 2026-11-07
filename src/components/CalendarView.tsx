import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Coffee,
  Plus,
  Trash2,
  Wallet,
  Check,
  Circle,
  Undo2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Task, TimeBlock, CustomizationConfig, LedgerDirection } from "../types";
import { QuickAddTask } from "./QuickAddTask";
import { useTranslation } from "../i18n/LanguageContext";
import LunarLib from "lunar-javascript";
import { getLocalDateString } from "../utils/date";
import { safeJsonParse } from "../utils/json";
import { createId } from "../utils/id";
import { groupTasksByDueDate, splitDayTasks } from "../utils/calendar/dayTasks";
import { usePersonal } from "../context/PersonalContext";
import { useLedger } from "../hooks/useLedger";
import {
  formatAmount,
  formatCompactAmount,
  formatNet,
  summarizeDay,
} from "../utils/ledger/ledgerCore";
import {
  resolveDayHolidayMeta,
  loadCachedICalHolidays,
  getRegionIcalUrl,
  type HolidayMap,
} from "../utils/holiday";

/** 完成时刻只精确到分钟，用于面板里回看当天做了什么。 */
function formatCompletedTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface CalendarViewProps {
  tasks: Task[];
  completedTasks: Task[];
  handleComplete: (id: string) => void;
  handleUndoComplete: (id: string) => void;
  handleAddTask: (taskData: {
    title: string;
    description: string;
    notes: string;
    category: Task["category"];
    dueDate: string;
    dueTime?: string;
    isExplicit?: boolean;
  }) => void;
  config?: CustomizationConfig;
}

export const CalendarView: React.FC<CalendarViewProps> = React.memo(
  ({ tasks, completedTasks, handleComplete, handleUndoComplete, handleAddTask, config }) => {
    const {
      calendarYear,
      setCalendarYear,
      calendarMonth,
      setCalendarMonth,
      selectedCalendarDate,
      setSelectedCalendarDate,
    } = usePersonal();
    const { t, locale } = useTranslation();
    const cv = t.calendarView;
    const m = t.matrix;

    const [viewMode, setViewMode] = useState<"month" | "week">("month");
    const showHolidays = config?.calendarShowHolidays ?? true;
    const holidayRegion = config?.calendarHolidayRegion ?? "cn";
    // 当前生效的 iCal 订阅地址：用户自定义优先，否则取该地区的官方订阅地址
    const activeIcalUrl = config?.calendarIcalUrl || getRegionIcalUrl(holidayRegion);

    // 自定义 iCal 数据缓存（按订阅地址分区，切换地区/改地址不会串数据）
    const [customHolidays, setCustomHolidays] = useState<HolidayMap>(() =>
      loadCachedICalHolidays(
        config?.calendarIcalUrl || getRegionIcalUrl(config?.calendarHolidayRegion ?? "cn"),
      ),
    );

    useEffect(() => {
      setCustomHolidays(loadCachedICalHolidays(activeIcalUrl));
      const handleIcalUpdate = (e: Event) => {
        const customEv = e as CustomEvent<{ url?: string }>;
        if (!customEv.detail?.url || customEv.detail.url === activeIcalUrl) {
          setCustomHolidays(loadCachedICalHolidays(activeIcalUrl));
        }
      };
      window.addEventListener("tongyun-ical-updated", handleIcalUpdate);
      return () => window.removeEventListener("tongyun-ical-updated", handleIcalUpdate);
    }, [activeIcalUrl]);

    // Pre-group tasks by due date using useMemo to convert O(N) filters to O(1) lookups
    const tasksByDueDate = useMemo(() => groupTasksByDueDate(tasks), [tasks]);

    // 已完成任务同样按任务日期（dueDate）归属，与未完成共用一套口径
    const completedByDueDate = useMemo(() => groupTasksByDueDate(completedTasks), [completedTasks]);

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

    const effectiveSelectedDate =
      selectedCalendarDate && !isNaN(new Date(`${selectedCalendarDate}T00:00:00`).getTime())
        ? selectedCalendarDate
        : getLocalDateString();

    const selectedDateBlocks = useMemo(
      () =>
        timeBlocks
          .filter((b) => b.date === effectiveSelectedDate)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      [timeBlocks, effectiveSelectedDate],
    );

    const addTimeBlock = () => {
      if (!newBlockTitle.trim()) return;
      const block: TimeBlock = {
        id: createId("tb"),
        date: effectiveSelectedDate,
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

    // ── 日历轻量记账与结算标记（issue #51 第 3 项） ──
    const {
      entries: ledgerEntries,
      getMonthTotals,
      addEntry: addLedgerEntry,
      removeEntry: removeLedgerEntry,
      toggleEntrySettled,
      setDaySettled,
    } = useLedger();

    const [showLedgerInput, setShowLedgerInput] = useState(false);
    const [ledgerAmount, setLedgerAmount] = useState("");
    const [ledgerDirection, setLedgerDirection] = useState<LedgerDirection>("out");
    const [ledgerNote, setLedgerNote] = useState("");

    // 按日期分组，供 42 格月历 O(1) 查当日合计
    const ledgerTotalsByDate = useMemo(() => {
      const map: Record<string, ReturnType<typeof summarizeDay>> = {};
      for (const entry of ledgerEntries) {
        if (!map[entry.date]) {
          map[entry.date] = summarizeDay(ledgerEntries, entry.date);
        }
      }
      return map;
    }, [ledgerEntries]);

    const selectedDateLedgerEntries = useMemo(
      () =>
        ledgerEntries
          .filter((e) => e.date === effectiveSelectedDate)
          .sort((a, b) => a.createdAt - b.createdAt),
      [ledgerEntries, effectiveSelectedDate],
    );

    const selectedDayLedgerTotals = useMemo(
      () => summarizeDay(ledgerEntries, effectiveSelectedDate),
      [ledgerEntries, effectiveSelectedDate],
    );

    const monthLedgerTotals = useMemo(
      () => getMonthTotals(calendarYear, calendarMonth + 1),
      [getMonthTotals, calendarYear, calendarMonth],
    );

    const handleAddLedgerEntry = () => {
      const amount = Number(ledgerAmount);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const created = addLedgerEntry({
        date: effectiveSelectedDate,
        amount,
        direction: ledgerDirection,
        note: ledgerNote,
      });
      if (!created) return;
      setLedgerAmount("");
      setLedgerNote("");
    };

    const handleLedgerAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddLedgerEntry();
      }
    };

    const getDayMeta = useCallback(
      (dateStr: string) => {
        return resolveDayHolidayMeta(dateStr, {
          showHolidays,
          customHolidays,
          region: holidayRegion,
        });
      },
      [showHolidays, customHolidays, holidayRegion],
    );

    const getLunarDate = (dateStr: string) => {
      try {
        const [y, m, d] = dateStr.split("-").map(Number);
        const solar = LunarLib.Solar.fromYmd(y, m, d);
        const lunar = solar.getLunar();
        if (locale === "en") {
          return {
            month: String(Math.abs(lunar.getMonth())),
            day: String(lunar.getDay()),
            year: String(lunar.getYear()),
            full: `Lunar ${Math.abs(lunar.getMonth())}/${lunar.getDay()}`,
          };
        }
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
          .map((tk) => (
            <span
              key={tk.id}
              className={`w-1 h-1 rounded-full ${
                tk.category === "urgent-important"
                  ? "bg-[#E8A0BF]"
                  : tk.category === "important-not-urgent"
                    ? "bg-[#C4D7B2]"
                    : tk.category === "urgent-not-important"
                      ? "bg-[#B2C8DF]"
                      : "bg-[#F5EBEB]"
              }`}
            />
          ));
      },
      [tasksByDueDate],
    );

    /**
     * 日格右上角的记账角标（issue #51 第 3 项）。
     * 有未结算条目 → 红底提示待结算；全部已结算 → 绿底。
     * 宽度上限与日期数字的左移留白保持一致，避免金额被截断。
     */
    const renderLedgerBadge = useCallback(
      (dateStr: string) => {
        const totals = ledgerTotalsByDate[dateStr];
        if (!totals || !totals.hasEntries) return null;
        const settled = totals.allSettled;
        return (
          <span
            className={`absolute top-0.5 right-0.5 text-[6px] font-extrabold leading-none px-1 py-[2px] rounded-md max-w-[44px] truncate ${
              settled
                ? "bg-[#4D7C5D]/85 text-white dark:bg-[#6FAD84]/85"
                : "bg-[#D4380D]/85 text-white dark:bg-[#F06A4B]/85"
            }`}
            title={`${totals.income > 0 ? `收 ${formatAmount(totals.income)} ` : ""}${
              totals.expense > 0 ? `支 ${formatAmount(totals.expense)}` : ""
            }`}
          >
            {formatCompactAmount(totals.net)}
          </span>
        );
      },
      [ledgerTotalsByDate],
    );

    /** 角标占据右上角时，日期数字需要左移避免压字 */
    const ledgerBadgePadding = useCallback(
      (dateStr: string) => (ledgerTotalsByDate[dateStr]?.hasEntries ? "pr-[46px]" : ""),
      [ledgerTotalsByDate],
    );

    // 月历 42 格计算
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
            className={`relative h-11 rounded-xl text-[10px] font-bold text-slate-300 dark:text-slate-600 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] transition-all flex flex-col items-center justify-between py-1 border border-transparent cursor-pointer ${
              effectiveSelectedDate === dateStr
                ? "bg-[#FAF8F5] dark:bg-[#282A30] border-[#EFEBE4] dark:border-[#383A42]"
                : ""
            }`}
          >
            {renderLedgerBadge(dateStr)}
            <span className="flex items-center gap-0.5">
              {prevMeta.label && (
                <span className="text-[5px] px-0.5 rounded font-extrabold opacity-60">
                  {prevMeta.label}
                </span>
              )}
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
        const isSelected = dateStr === effectiveSelectedDate;
        const meta = getDayMeta(dateStr);

        let cellStyle =
          "bg-white dark:bg-[#202227] border-[#FAF8F5] dark:border-[#282A30] text-slate-700 dark:text-slate-200";
        let badgeText = "";
        let badgeStyle = "";

        if (meta.label === "休") {
          cellStyle =
            "bg-[#FFF5F3] dark:bg-[#331D1A] border-[#FFD9D0] dark:border-[#4D2822] text-[#D4380D] dark:text-[#F06A4B]";
          badgeText = "休";
          badgeStyle = "bg-[#D4380D] text-white";
        } else if (meta.label === "班") {
          cellStyle =
            "bg-[#FAFAFA] dark:bg-[#24272E] border-[#E8E4DE] dark:border-[#353A45] text-slate-500 dark:text-slate-400";
          badgeText = "班";
          badgeStyle = "bg-slate-400 text-white";
        } else if (meta.isWeekend) {
          cellStyle =
            "bg-[#FFF9F5] dark:bg-[#2A231F] border-[#F5EDE8] dark:border-[#3D332D] text-[#B88A6B] dark:text-[#D1A88A]";
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
            className={`relative h-11 rounded-xl text-[10px] font-bold transition-all flex flex-col items-center justify-between py-1 border cursor-pointer ${cellStyle}`}
            title={meta.name || undefined}
          >
            {renderLedgerBadge(dateStr)}
            <span
              className={`relative leading-none flex items-center justify-center w-full gap-0.5 ${ledgerBadgePadding(dateStr)}`}
            >
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
              {meta.label === "休" || meta.label === "班" ? (
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
            className={`relative h-11 rounded-xl text-[10px] font-bold text-slate-300 dark:text-slate-600 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] transition-all flex flex-col items-center justify-between py-1 border border-transparent cursor-pointer ${
              effectiveSelectedDate === dateStr
                ? "bg-[#FAF8F5] dark:bg-[#282A30] border-[#EFEBE4] dark:border-[#383A42]"
                : ""
            }`}
          >
            {renderLedgerBadge(dateStr)}
            <span className="flex items-center gap-0.5">
              {nextMeta.label && (
                <span className="text-[5px] px-0.5 rounded font-extrabold opacity-60">
                  {nextMeta.label}
                </span>
              )}
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
      effectiveSelectedDate,
      getDayMeta,
      renderDayDots,
      renderLedgerBadge,
      ledgerBadgePadding,
      setSelectedCalendarDate,
    ]);

    // 周视图 7 天计算 (以当前选中日期所在周：周日 ~ 周六)
    const weekDays = useMemo(() => {
      const selected = new Date(`${effectiveSelectedDate}T00:00:00`);
      const baseDate = isNaN(selected.getTime()) ? new Date() : selected;
      const dayOfWeek = baseDate.getDay(); // 0 是周日
      const sunday = new Date(baseDate);
      sunday.setDate(baseDate.getDate() - dayOfWeek);

      const days: {
        dateStr: string;
        dayNum: number;
        weekdayIndex: number;
        meta: ReturnType<typeof getDayMeta>;
        tasks: Task[];
        isToday: boolean;
        isSelected: boolean;
      }[] = [];

      const todayStr = getLocalDateString();
      for (let i = 0; i < 7; i++) {
        const cur = new Date(sunday);
        cur.setDate(sunday.getDate() + i);
        const dateStr = getLocalDateString(cur);
        days.push({
          dateStr,
          dayNum: cur.getDate(),
          weekdayIndex: i,
          meta: getDayMeta(dateStr),
          tasks: tasksByDueDate[dateStr] || [],
          isToday: dateStr === todayStr,
          isSelected: dateStr === effectiveSelectedDate,
        });
      }
      return days;
    }, [effectiveSelectedDate, getDayMeta, tasksByDueDate]);

    // 当日已完成任务（issue #51 日历面板）：默认展开，可折叠
    const [showDayCompleted, setShowDayCompleted] = useState(true);
    const selectedDayGroups = useMemo(
      () => splitDayTasks(tasksByDueDate, completedByDueDate, effectiveSelectedDate),
      [tasksByDueDate, completedByDueDate, effectiveSelectedDate],
    );

    const handleNavigate = (direction: -1 | 1) => {
      if (viewMode === "month") {
        if (direction === -1) {
          if (calendarMonth === 0) {
            setCalendarMonth(11);
            setCalendarYear((y) => y - 1);
          } else {
            setCalendarMonth((m) => m - 1);
          }
        } else {
          if (calendarMonth === 11) {
            setCalendarMonth(0);
            setCalendarYear((y) => y + 1);
          } else {
            setCalendarMonth((m) => m + 1);
          }
        }
      } else {
        // 周视图：按周加减 7 天
        const cur = new Date(`${effectiveSelectedDate}T00:00:00`);
        if (!isNaN(cur.getTime())) {
          cur.setDate(cur.getDate() + direction * 7);
          const newDateStr = getLocalDateString(cur);
          setSelectedCalendarDate(newDateStr);
          setCalendarYear(cur.getFullYear());
          setCalendarMonth(cur.getMonth());
        }
      }
    };

    const handleBackToToday = () => {
      const today = new Date();
      setCalendarYear(today.getFullYear());
      setCalendarMonth(today.getMonth());
      setSelectedCalendarDate(getLocalDateString(today));
    };

    return (
      <div className="animate-fade-in-up flex flex-col gap-4 flex-grow z-10 relative select-none">
        <div className="grid grid-cols-3 gap-6 flex-grow">
          {/* 左侧日历网格页 (月视图 / 周视图) */}
          <div className="col-span-2 rounded-2xl bg-white/90 dark:bg-[#1E2025]/95 border border-[#EFEBE4] dark:border-[#33353A] p-5 flex flex-col shadow-sm min-h-[440px]">
            {/* 日历导航栏 */}
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEBE4] dark:border-[#33353A] mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-[#2D323A] dark:text-slate-100 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#4D7C5D] dark:text-[#6DAF7E]" />
                  <span>
                    {viewMode === "month"
                      ? cv.yearMonth
                          .replace("{year}", String(calendarYear))
                          .replace("{month}", String(calendarMonth + 1))
                      : `${cv.yearMonth.replace("{year}", String(calendarYear)).replace("{month}", String(calendarMonth + 1))} · ${effectiveSelectedDate}`}
                  </span>
                </h3>

                {/* 视图切换 (月视图 / 周视图) */}
                <div className="flex items-center bg-[#FAF8F5] dark:bg-[#282A30] p-0.5 rounded-lg border border-[#EFEBE4] dark:border-[#33353A]">
                  <button
                    type="button"
                    onClick={() => setViewMode("month")}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      viewMode === "month"
                        ? "bg-white dark:bg-[#1E2025] text-[#4D7C5D] dark:text-[#6DAF7E] shadow-xs"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {cv.monthView || "月视图"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("week")}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      viewMode === "week"
                        ? "bg-white dark:bg-[#1E2025] text-[#4D7C5D] dark:text-[#6DAF7E] shadow-xs"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {cv.weekView || "周视图"}
                  </button>
                </div>
              </div>

              {/* 翻页与回到今天 */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavigate(-1)}
                  className="p-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#33353A] hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                  title={viewMode === "month" ? cv.prevMonth : "上一周"}
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
                  type="button"
                  onClick={handleBackToToday}
                  className="text-[10px] px-3 py-1.5 rounded-lg bg-[#4D7C5D] hover:bg-[#3D6A4F] text-white font-extrabold transition-all cursor-pointer shadow-sm"
                >
                  {cv.backToToday}
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate(1)}
                  className="p-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#33353A] hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                  title={viewMode === "month" ? cv.nextMonth : "下一周"}
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

            {viewMode === "month" ? (
              <>
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

                {/* 42 单元格月历容器 */}
                <div className="grid grid-cols-7 gap-2 flex-grow">{dayGrid}</div>

                {/* 月度合计与未结算合计（issue #51 第 3 项） */}
                <div className="mt-3 pt-2.5 border-t border-[#EFEBE4] dark:border-[#33353A] flex items-center justify-between gap-3 text-[10px]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center gap-1 font-bold text-slate-500 dark:text-slate-400">
                      <span>{cv.ledgerMonthTotal}</span>
                      <span
                        className={`font-extrabold ${
                          monthLedgerTotals.net < 0
                            ? "text-[#D4380D] dark:text-[#F06A4B]"
                            : "text-[#4D7C5D] dark:text-[#6FAD84]"
                        }`}
                      >
                        {formatNet(monthLedgerTotals.net)}
                      </span>
                    </span>
                    {monthLedgerTotals.unsettledCount > 0 && (
                      <span className="flex items-center gap-1 font-bold text-slate-500 dark:text-slate-400">
                        <span>{cv.ledgerMonthUnsettled}</span>
                        <span className="font-extrabold text-[#D4380D] dark:text-[#F06A4B]">
                          {formatNet(monthLedgerTotals.unsettledNet)}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {cv.ledgerMonthCount.replace(
                            "{count}",
                            String(monthLedgerTotals.unsettledCount),
                          )}
                        </span>
                      </span>
                    )}
                  </div>
                  {monthLedgerTotals.hasEntries && (
                    <span className="flex items-center gap-2 text-[9px] text-slate-400 font-bold shrink-0">
                      <span className="text-[#4D7C5D] dark:text-[#6FAD84]">
                        {cv.ledgerIncome} {formatAmount(monthLedgerTotals.income)}
                      </span>
                      <span className="text-[#D4380D] dark:text-[#F06A4B]">
                        {cv.ledgerExpense} {formatAmount(monthLedgerTotals.expense)}
                      </span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              /* 周视图容器：7 列卡片 */
              <div className="grid grid-cols-7 gap-2 flex-grow">
                {weekDays.map((day) => {
                  const weekdayLabels = [cv.sun, cv.mon, cv.tue, cv.wed, cv.thu, cv.fri, cv.sat];
                  const label = weekdayLabels[day.weekdayIndex];
                  const isWeekendDay = day.weekdayIndex === 0 || day.weekdayIndex === 6;

                  const cardBorder = day.isSelected
                    ? "border-[#A34E36] dark:border-[#E27760] bg-[#FCF2F0]/40 dark:bg-[#3A2225]/40"
                    : day.isToday
                      ? "border-[#4D7C5D] dark:border-[#6FAD84] bg-[#F0F5F1]/50 dark:bg-[#212E24]/40"
                      : "border-[#EFEBE4] dark:border-[#33353A] bg-white/70 dark:bg-[#202227]/70";

                  return (
                    <div
                      key={day.dateStr}
                      onClick={() => setSelectedCalendarDate(day.dateStr)}
                      className={`rounded-xl border p-2 flex flex-col justify-between transition-all cursor-pointer hover:shadow-xs ${cardBorder}`}
                    >
                      {/* 顶部：周几与日期 */}
                      <div className="border-b border-[#EFEBE4]/60 dark:border-[#33353A]/60 pb-1.5 mb-1.5">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-extrabold ${
                              isWeekendDay
                                ? "text-[#D4380D]/80 dark:text-[#F06A4B]"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {label}
                          </span>
                          <span
                            className={`text-[11px] font-black ${
                              day.isToday
                                ? "text-[#4D7C5D] dark:text-[#6FAD84]"
                                : "text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {day.dayNum}
                          </span>
                        </div>

                        {/* 节假日 / 调休标签 */}
                        <div className="flex items-center justify-between mt-1 min-h-[14px]">
                          {day.meta.label === "休" ? (
                            <span className="text-[7px] px-1 py-0.2 rounded font-extrabold bg-[#D4380D] text-white">
                              休
                            </span>
                          ) : day.meta.label === "班" ? (
                            <span className="text-[7px] px-1 py-0.2 rounded font-extrabold bg-slate-500 text-white">
                              班
                            </span>
                          ) : (
                            <span />
                          )}
                          {day.meta.name &&
                            (day.meta.label === "休" || day.meta.label === "班") && (
                              <span className="text-[6px] text-slate-500 dark:text-slate-400 font-bold truncate max-w-[42px]">
                                {day.meta.name}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* 中间：当日任务预览 */}
                      <div className="flex-grow space-y-1 overflow-y-auto max-h-[220px] custom-scrollbar pr-0.5">
                        {day.tasks.length > 0 ? (
                          day.tasks.map((task) => (
                            <div
                              key={task.id}
                              className="text-[8px] p-1 rounded bg-[#FAF8F5] dark:bg-[#26282E] border border-[#EFEBE4]/50 dark:border-[#33353A] truncate font-medium text-slate-600 dark:text-slate-300"
                              title={task.title}
                            >
                              • {task.title}
                            </div>
                          ))
                        ) : (
                          <div className="text-[7px] text-slate-300 dark:text-slate-600 text-center py-4">
                            -
                          </div>
                        )}
                      </div>

                      {/* 底部点状指示 */}
                      <div className="flex gap-0.5 justify-center pt-1 min-h-[6px]">
                        {renderDayDots(day.dateStr)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右侧面板: 上=当日信息 下=待办列 */}
          <div className="rounded-2xl bg-white/90 dark:bg-[#1E2025]/95 border border-[#EFEBE4] dark:border-[#33353A] shadow-sm flex flex-col overflow-hidden max-h-[480px]">
            {/* 上: 当日信息 */}
            <div className="p-5 pb-0">
              <div className="bg-[#FAF8F5] dark:bg-[#26282E] rounded-xl p-4 border border-transparent dark:border-[#33353A]/40">
                <div className="relative flex items-start justify-between">
                  <div>
                    <h4 className="text-[11px] font-extrabold text-[#2D323A] dark:text-slate-100">
                      {new Date(`${effectiveSelectedDate}T00:00:00`).toLocaleDateString(
                        locale === "en" ? "en-US" : "zh-CN",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          weekday: "long",
                        },
                      )}
                    </h4>
                    {(() => {
                      const lunar = getLunarDate(effectiveSelectedDate);
                      if (!lunar) return null;
                      return (
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5 tracking-wide">
                          {lunar.full}
                        </p>
                      );
                    })()}
                  </div>
                  {(() => {
                    const meta = getDayMeta(effectiveSelectedDate);
                    if (!meta.label) return null;
                    const badgeConfig: Record<
                      string,
                      { bg: string; text: string; icon: string; label: string }
                    > = {
                      休: { bg: "bg-[#D4380D]", text: "text-white", icon: "🎉", label: "休" },
                      班: { bg: "bg-slate-500", text: "text-white", icon: "📅", label: "班" },
                    };
                    const c = badgeConfig[meta.label];
                    if (!c) return null;
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
                  const meta = getDayMeta(effectiveSelectedDate);
                  if (!meta.label || !meta.name) return null;
                  return (
                    <div className="mt-2 text-[9px] text-slate-500 font-bold leading-relaxed">
                      {meta.label === "休" && `📌 ${meta.name}`}
                      {meta.label === "班" && `📌 ${meta.name}，今天上班`}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="border-t border-[#EFEBE4] dark:border-[#33353A] mx-5 my-3" />

            {/* 中: 当日账目（轻量记账与结算标记，issue #51 第 3 项） */}
            <div className="px-5 pb-3 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-extrabold text-[#4D7C5D] dark:text-[#6FAD84] tracking-wide flex items-center gap-1.5">
                  <Wallet className="w-3 h-3" />
                  <span>{cv.ledgerTitle}</span>
                </h3>
                <div className="flex items-center gap-2 text-[9px] font-bold">
                  {selectedDayLedgerTotals.hasEntries && (
                    <>
                      <span className="text-slate-400">{cv.ledgerDayTotal}</span>
                      <span
                        className={`font-extrabold ${
                          selectedDayLedgerTotals.net < 0
                            ? "text-[#D4380D] dark:text-[#F06A4B]"
                            : "text-[#4D7C5D] dark:text-[#6FAD84]"
                        }`}
                      >
                        {formatNet(selectedDayLedgerTotals.net)}
                      </span>
                    </>
                  )}
                  {selectedDateLedgerEntries.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDaySettled(effectiveSelectedDate, !selectedDayLedgerTotals.allSettled)
                      }
                      className="text-[8px] px-1.5 py-0.5 rounded border border-[#DEEAE2] dark:border-[#33353A] text-[#4D7C5D] dark:text-[#6FAD84] hover:bg-[#F0F5F1] dark:hover:bg-[#252830] transition-colors cursor-pointer font-bold"
                    >
                      {selectedDayLedgerTotals.allSettled
                        ? cv.ledgerUnsettleDay
                        : cv.ledgerSettleDay}
                    </button>
                  )}
                </div>
              </div>

              {/* 当日条目列表 */}
              {selectedDateLedgerEntries.length > 0 ? (
                <div className="space-y-1 mb-2 max-h-[132px] overflow-y-auto custom-scrollbar pr-0.5">
                  {selectedDateLedgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#FAF8F5]/70 dark:bg-[#26282E]/70 border border-[#EFEBE4]/75 dark:border-[#33353A] group"
                    >
                      <button
                        type="button"
                        onClick={() => toggleEntrySettled(entry.id)}
                        title={entry.settled ? cv.ledgerSettled : cv.ledgerUnsettled}
                        className="shrink-0 cursor-pointer"
                      >
                        {entry.settled ? (
                          <Check className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#6FAD84]" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                        )}
                      </button>
                      <span
                        className={`text-[8px] font-extrabold px-1 py-0.5 rounded shrink-0 ${
                          entry.direction === "in"
                            ? "bg-[#E8F3EC] text-[#4D7C5D] dark:bg-[#22301F] dark:text-[#6FAD84]"
                            : "bg-[#FDECEA] text-[#D4380D] dark:bg-[#331D1A] dark:text-[#F06A4B]"
                        }`}
                      >
                        {entry.direction === "in" ? cv.ledgerIncome : cv.ledgerExpense}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold shrink-0 ${
                          entry.settled
                            ? "text-slate-400 dark:text-slate-500 line-through"
                            : "text-[#2D323A] dark:text-slate-200"
                        }`}
                      >
                        {formatAmount(entry.amount)}
                      </span>
                      {entry.note && (
                        <span className="text-[8px] text-slate-400 truncate min-w-0 flex-1">
                          {entry.note}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeLedgerEntry(entry.id)}
                        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[9px] text-slate-400 font-bold mb-2">{cv.ledgerEmpty}</p>
              )}

              {/* 记账输入 */}
              {showLedgerInput ? (
                <div className="p-2 rounded-xl bg-[#FAF8F5] dark:bg-[#26282E] border border-[#EFEBE4] dark:border-[#33353A] space-y-1.5 animate-fade-in-up">
                  <div className="flex items-center gap-1.5">
                    <div className="flex rounded-lg overflow-hidden border border-[#EFEBE4] dark:border-[#33353A] shrink-0">
                      <button
                        type="button"
                        onClick={() => setLedgerDirection("out")}
                        className={`px-2 py-1 text-[9px] font-extrabold transition-colors cursor-pointer ${
                          ledgerDirection === "out"
                            ? "bg-[#D4380D] text-white"
                            : "bg-white dark:bg-[#1C1D21] text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {cv.ledgerExpense}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerDirection("in")}
                        className={`px-2 py-1 text-[9px] font-extrabold transition-colors cursor-pointer ${
                          ledgerDirection === "in"
                            ? "bg-[#4D7C5D] text-white"
                            : "bg-white dark:bg-[#1C1D21] text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {cv.ledgerIncome}
                      </button>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={ledgerAmount}
                      onChange={(e) => setLedgerAmount(e.target.value)}
                      onKeyDown={handleLedgerAmountKeyDown}
                      placeholder={cv.ledgerAmountPlaceholder}
                      className="flex-1 min-w-0 bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] font-bold"
                    />
                  </div>
                  <input
                    type="text"
                    value={ledgerNote}
                    onChange={(e) => setLedgerNote(e.target.value)}
                    onKeyDown={handleLedgerAmountKeyDown}
                    placeholder={cv.ledgerNotePlaceholder}
                    className="w-full bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] px-2 py-1 rounded-lg text-[10px] text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-[#C4D7B2] dark:focus:border-[#4D7C5D] font-medium"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowLedgerInput(false)}
                      className="text-[9px] px-2 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#33353A] text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#33353A] transition-colors cursor-pointer font-bold"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLedgerEntry}
                      className="text-[9px] px-2 py-1 rounded-lg bg-[#4D7C5D] text-white font-bold hover:bg-[#3F684C] transition-colors cursor-pointer"
                    >
                      {cv.ledgerAddTitle}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLedgerInput(true)}
                  className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-[#4D7C5D] dark:hover:text-[#6FAD84] transition-colors cursor-pointer font-medium"
                >
                  <Plus className="w-3 h-3" /> {cv.ledgerAddTitle}
                </button>
              )}
            </div>

            <div className="border-t border-[#EFEBE4] dark:border-[#33353A] mx-5 my-3" />

            {/* 下: 待办列 */}
            <div className="px-5 pb-5 flex-grow flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[10px] font-extrabold text-[#8B6E3C] dark:text-[#E2C799] tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-[#8B6E3C] dark:text-[#E2C799]" />
                  <span>{cv.tasksForDate.replace("{date}", effectiveSelectedDate)}</span>
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

              {/* 单日列表循环：未完成在上，当天已完成的弱样式列表在下 */}
              <div className="flex-grow overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                {selectedDayGroups.hasAny ? (
                  <>
                    {selectedDayGroups.pending.map((task) => (
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
                    ))}

                    {selectedDayGroups.completed.length > 0 && (
                      <div className="pt-0.5">
                        <button
                          onClick={() => setShowDayCompleted((prev) => !prev)}
                          className="w-full flex items-center gap-1 text-[9px] font-extrabold text-slate-400 dark:text-slate-500 hover:text-[#4D7C5D] dark:hover:text-[#78C496] transition-colors cursor-pointer tracking-wide"
                        >
                          {showDayCompleted ? (
                            <ChevronDown className="w-3 h-3 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3 h-3 shrink-0" />
                          )}
                          <span>
                            {cv.completedTasksForDate.replace(
                              "{count}",
                              String(selectedDayGroups.completed.length),
                            )}
                          </span>
                        </button>
                        {showDayCompleted && (
                          <div className="space-y-1.5 mt-1.5">
                            {selectedDayGroups.completed.map((task) => (
                              <div
                                key={task.id}
                                className="p-2.5 rounded-xl bg-[#F0F5F1]/40 dark:bg-[#1C251F]/40 border border-[#DEEAE2]/60 dark:border-[#26382C]/60 flex justify-between items-center gap-2 group hover:bg-[#F0F5F1]/70 dark:hover:bg-[#1C251F]/70 transition-all"
                              >
                                <div className="min-w-0 flex-grow flex items-center gap-2">
                                  <Check className="w-3 h-3 shrink-0 text-[#4D7C5D]/60 dark:text-[#78C496]/60" />
                                  <div className="min-w-0">
                                    <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 line-through decoration-slate-300 dark:decoration-slate-600 truncate">
                                      {task.title}
                                    </h4>
                                    {task.completedAt != null && (
                                      <p className="text-[8px] text-slate-400/80 dark:text-slate-600 truncate mt-0.5">
                                        {cv.completedAtLabel.replace(
                                          "{time}",
                                          formatCompletedTime(task.completedAt),
                                        )}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleUndoComplete(task.id)}
                                  title={t.common.undo}
                                  className="flex-shrink-0 p-1 rounded text-slate-400 dark:text-slate-500 hover:text-[#A34E36] dark:hover:text-[#F87171] hover:bg-[#FCF2F0]/60 dark:hover:bg-[#3D1F24]/50 transition-all cursor-pointer"
                                >
                                  <Undo2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
                  <Plus className="w-3 h-3" /> {locale === "en" ? "Add time block" : "添加时间块"}
                </button>
              )}

              {/* 极速行内添加栏 */}
              <div className="mt-2.5">
                <QuickAddTask
                  handleAddTask={handleAddTask}
                  defaultDueDate={effectiveSelectedDate}
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

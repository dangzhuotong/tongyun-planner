import React, { useMemo } from "react";
import { BarChart3, TrendingUp, TrendingDown, Flame } from "lucide-react";
import type { PomodoroLog } from "../types";
import { getLocalDateString } from "../utils/date";
import { useTranslation } from "../i18n/LanguageContext";

export interface FocusHeatmapProps {
  pomodoroLogs: PomodoroLog[];
  weeks?: number;
  title?: string;
  showStatsGlance?: boolean;
}

const CELL_SIZE = 12;
const CELL_GAP = 3;
const STEP = CELL_SIZE + CELL_GAP;
const MONTH_LABEL_HEIGHT = 16;
const LABEL_WIDTH = 20;

const LEVEL_CLASSES = [
  "fill-[#ebedf0] dark:fill-[#2d333b]", // 0
  "fill-[#9be9a8] dark:fill-[#0e4429]", // 1-2
  "fill-[#40c463] dark:fill-[#006d32]", // 3-4
  "fill-[#30a14e] dark:fill-[#26a641]", // 5-6
  "fill-[#216e39] dark:fill-[#39d353]", // 7+
];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

export const FocusHeatmap: React.FC<FocusHeatmapProps> = ({
  pomodoroLogs,
  weeks = 26,
  title,
  showStatsGlance = false,
}) => {
  const { t } = useTranslation();
  const a = t.analytics;

  const { grid, stats, monthLabels } = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const log of pomodoroLogs) {
      const dateStr = getLocalDateString(new Date(log.timestamp));
      perDay.set(dateStr, (perDay.get(dateStr) || 0) + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = getLocalDateString(today);
    const dayOfWeek = today.getDay();

    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + mondayOffset);

    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);

    let thisWeekCount = 0;
    let lastWeekCount = 0;
    const thisWeekActiveSet = new Set<string>();

    let bestDayDate = "";
    let bestDayCount = 0;
    perDay.forEach((count, date) => {
      if (count > bestDayCount) {
        bestDayCount = count;
        bestDayDate = date;
      }
    });

    const lastSunday = new Date(today);
    lastSunday.setDate(lastSunday.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));

    const grid: { date: string; count: number; isToday: boolean }[][] = [];
    const monthLabels: { colIndex: number; label: string }[] = [];
    let prevMonth = -1;
    let colIndex = 0;

    for (let col = weeks - 1; col >= 0; col--) {
      const colSunday = new Date(lastSunday);
      colSunday.setDate(colSunday.getDate() - col * 7);
      const colMonday = new Date(colSunday);
      colMonday.setDate(colMonday.getDate() - 6);

      const colData: { date: string; count: number; isToday: boolean }[] = [];
      for (let row = 0; row < 7; row++) {
        const cellDate = new Date(colMonday);
        cellDate.setDate(cellDate.getDate() + row);
        cellDate.setHours(0, 0, 0, 0);
        const dateStr = getLocalDateString(cellDate);
        const count = perDay.get(dateStr) || 0;
        const isToday = dateStr === todayStr;

        if (cellDate >= thisMonday && cellDate < nextMonday) {
          thisWeekCount += count;
          if (count > 0) thisWeekActiveSet.add(dateStr);
        } else if (cellDate >= lastMonday && cellDate < thisMonday) {
          lastWeekCount += count;
        }

        colData.push({ date: dateStr, count, isToday });

        if (row === 0) {
          const month = cellDate.getMonth();
          if (month !== prevMonth) {
            monthLabels.push({ colIndex, label: `${month + 1}月` });
            prevMonth = month;
          }
        }
      }
      grid.push(colData);
      colIndex++;
    }

    if (dayOfWeek !== 0) {
      const partialCol: { date: string; count: number; isToday: boolean }[] = [];
      for (let row = 0; row < dayOfWeek; row++) {
        const cellDate = new Date(thisMonday);
        cellDate.setDate(cellDate.getDate() + row);
        cellDate.setHours(0, 0, 0, 0);
        const dateStr = getLocalDateString(cellDate);
        const count = perDay.get(dateStr) || 0;
        const isToday = dateStr === todayStr;

        if (cellDate >= thisMonday && cellDate < nextMonday) {
          thisWeekCount += count;
          if (count > 0) thisWeekActiveSet.add(dateStr);
        }

        partialCol.push({ date: dateStr, count, isToday });

        if (row === 0) {
          const month = cellDate.getMonth();
          if (month !== prevMonth) {
            monthLabels.push({ colIndex, label: `${month + 1}月` });
            prevMonth = month;
          }
        }
      }
      grid.push(partialCol);
    }

    let total = 0;
    let activeDays = 0;
    for (const col of grid) {
      for (const cell of col) {
        total += cell.count;
        if (cell.count > 0) activeDays++;
      }
    }

    let streak = 0;
    const cursor = new Date(today);
    while (true) {
      const key = getLocalDateString(cursor);
      if ((perDay.get(key) || 0) > 0) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      grid,
      stats: {
        total,
        activeDays,
        streak,
        bestDayDate,
        bestDayCount,
        thisWeekCount,
        lastWeekCount,
        thisWeekActiveDays: thisWeekActiveSet.size,
        delta: thisWeekCount - lastWeekCount,
      },
      monthLabels,
    };
  }, [pomodoroLogs, weeks]);

  const totalWeeks = grid.length;
  const gridW = totalWeeks * STEP;
  const gridH = 7 * STEP;
  const totalSvgW = LABEL_WIDTH + gridW;
  const totalSvgH = MONTH_LABEL_HEIGHT + gridH;

  const dayLabels = [
    { label: "一", offset: 0 },
    { label: "三", offset: 2 },
    { label: "五", offset: 4 },
  ];

  return (
    <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 shadow-sm select-none flex flex-col justify-between">
      {/* 标题与统计图例 */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EFEBE4] mb-3.5">
        <h3 className="text-xs font-bold text-[#2D323A] flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-[#4D7C5D]" />
          <span>{title || a.heatmapTitle}</span>
        </h3>
        <div className="flex items-center gap-2.5">
          {stats.streak > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FCF2F0] border border-[#F5DFDB] text-[9px] font-bold text-[#A34E36]">
              🔥 连续 {stats.streak} 天
            </span>
          )}
          <div className="flex items-center gap-1 text-[8px] text-slate-400 font-bold uppercase tracking-wider">
            <span>{a.low}</span>
            <div className="w-[10px] h-[10px] rounded-[2px] bg-[#ebedf0] dark:bg-[#2d333b]" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-[#9be9a8] dark:bg-[#0e4429]" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-[#40c463] dark:bg-[#006d32]" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-[#30a14e] dark:bg-[#26a641]" />
            <div className="w-[10px] h-[10px] rounded-[2px] bg-[#216e39] dark:bg-[#39d353]" />
            <span>{a.high}</span>
          </div>
        </div>
      </div>

      {/* SVG 热力图 — 自适应平铺铺满 */}
      <div className="w-full my-1">
        <svg
          viewBox={`0 0 ${totalSvgW} ${totalSvgH}`}
          className="w-full h-auto overflow-visible block"
        >
          {/* 月份标签 */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={LABEL_WIDTH + m.colIndex * STEP + CELL_SIZE / 2}
              y={10}
              textAnchor="middle"
              className="fill-slate-400 font-bold"
              fontSize={8}
            >
              {m.label}
            </text>
          ))}

          {/* 星期标签 */}
          {dayLabels.map((d) => (
            <text
              key={d.offset}
              x={12}
              y={MONTH_LABEL_HEIGHT + d.offset * STEP + CELL_SIZE - 2}
              textAnchor="end"
              className="fill-slate-400 font-bold"
              fontSize={8}
            >
              {d.label}
            </text>
          ))}

          {/* 格子 */}
          {grid.map((col, ci) =>
            col.map((cell, ri) => (
              <rect
                key={`${ci}-${ri}`}
                x={LABEL_WIDTH + ci * STEP}
                y={MONTH_LABEL_HEIGHT + ri * STEP}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2.5}
                ry={2.5}
                className={`${LEVEL_CLASSES[getLevel(cell.count)]} transition-all duration-150 hover:brightness-110 cursor-help ${
                  cell.isToday ? "stroke-[#A34E36] stroke-[1.8]" : ""
                }`}
              >
                <title>{`${cell.date} · ${cell.count} 个番茄`}</title>
              </rect>
            ))
          )}
        </svg>
      </div>

      {/* 4 维数据速览与状态 */}
      {showStatsGlance && (
        <div className="mt-4 pt-3.5 border-t border-[#EFEBE4]/80">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[9px] font-black text-[#4D7C5D] tracking-widest uppercase">
              {a.weekGlance || "本周速览"}
            </span>
            <span className="text-[9px] font-bold text-slate-400">
              近 {weeks} 周累计 <span className="text-[#4D7C5D] font-extrabold">{stats.total}</span> 个番茄
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl bg-[#FAF8F5] border border-[#EFEBE4]/80 px-3 py-2.5 text-center">
              <div className="text-base font-black text-[#2D323A] tracking-tight leading-none">
                {stats.thisWeekCount}
              </div>
              <div className="text-[9px] font-bold text-slate-400 mt-1.5">
                {a.weekSessions || "个番茄 (本周)"}
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF8F5] border border-[#EFEBE4]/80 px-3 py-2.5 text-center">
              <div className="text-base font-black text-[#2D323A] tracking-tight leading-none">
                {stats.thisWeekActiveDays} <span className="text-[10px] text-slate-400 font-normal">/ 7</span>
              </div>
              <div className="text-[9px] font-bold text-slate-400 mt-1.5">
                {a.weekActiveDaysShort || "活跃天数"}
              </div>
            </div>

            <div
              className={`rounded-xl border px-3 py-2.5 text-center ${
                stats.delta > 0
                  ? "bg-[#F0F5F1] border-[#DEEAE2]"
                  : stats.delta < 0
                  ? "bg-[#FCF2F0] border-[#F5DFDB]"
                  : "bg-[#FAF8F5] border-[#EFEBE4]/80"
              }`}
            >
              <div
                className={`text-base font-black tracking-tight leading-none flex items-center justify-center gap-1 ${
                  stats.delta > 0
                    ? "text-[#4D7C5D]"
                    : stats.delta < 0
                    ? "text-[#A34E36]"
                    : "text-slate-500"
                }`}
              >
                {stats.delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : null}
                {stats.delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                {stats.delta === 0 ? "—" : `${stats.delta > 0 ? "+" : ""}${stats.delta}`}
              </div>
              <div className="text-[9px] font-bold text-slate-400 mt-1.5">
                {a.weekVsLast || "对比上周"}
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF8F5] border border-[#EFEBE4]/80 px-3 py-2.5 text-center">
              <div className="text-base font-black text-[#A34E36] tracking-tight leading-none flex items-center justify-center gap-1">
                {stats.streak > 0 ? (
                  <>
                    <Flame className="w-3.5 h-3.5 text-[#A34E36]" />
                    <span>{stats.streak} 天</span>
                  </>
                ) : (
                  <span>{stats.bestDayCount} 个</span>
                )}
              </div>
              <div className="text-[9px] font-bold text-slate-400 mt-1.5">
                {stats.streak > 0 ? "当前连续" : "单日最高"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

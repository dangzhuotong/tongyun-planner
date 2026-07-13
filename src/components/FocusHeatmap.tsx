import React, { useMemo } from "react";
import { Flame } from "lucide-react";
import type { PomodoroLog } from "../types";
import { getLocalDateString } from "../utils/date";

interface FocusHeatmapProps {
  pomodoroLogs: PomodoroLog[];
  weeks?: number;
}

/**
 * GitHub 风格专注热力图
 * 7 行(周一-周日) x N 列(周)，颜色深浅代表当天番茄钟数量
 */
const CELL_SIZE = 12;
const CELL_GAP = 2;
const STEP = CELL_SIZE + CELL_GAP;
const MONTH_LABEL_HEIGHT = 14;
const LABEL_WIDTH = 18;

// GitHub 经典绿色色阶
const LEVEL_COLORS = [
  "bg-[#ebedf0]", // 0
  "bg-[#9be9a8]", // 1-2
  "bg-[#40c463]", // 3-4
  "bg-[#30a14e]", // 5-6
  "bg-[#216e39]", // 7+
];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

export const FocusHeatmap: React.FC<FocusHeatmapProps> = ({ pomodoroLogs, weeks = 12 }) => {
  const { grid, stats, monthLabels } = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const log of pomodoroLogs) {
      const dateStr = getLocalDateString(new Date(log.timestamp));
      perDay.set(dateStr, (perDay.get(dateStr) || 0) + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();

    const lastSunday = new Date(today);
    lastSunday.setDate(lastSunday.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));

    const grid: { date: string; count: number }[][] = [];
    const monthLabels: { colIndex: number; label: string }[] = [];
    let prevMonth = -1;
    let colIndex = 0;

    for (let col = weeks - 1; col >= 0; col--) {
      const colSunday = new Date(lastSunday);
      colSunday.setDate(colSunday.getDate() - col * 7);
      const colMonday = new Date(colSunday);
      colMonday.setDate(colMonday.getDate() - 6);

      const colData: { date: string; count: number }[] = [];
      for (let row = 0; row < 7; row++) {
        const cellDate = new Date(colMonday);
        cellDate.setDate(cellDate.getDate() + row);
        cellDate.setHours(0, 0, 0, 0);
        const dateStr = getLocalDateString(cellDate);
        const count = perDay.get(dateStr) || 0;
        colData.push({ date: dateStr, count });

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
      const thisMonday = new Date(today);
      thisMonday.setDate(thisMonday.getDate() - (dayOfWeek - 1));

      const partialCol: { date: string; count: number }[] = [];
      for (let row = 0; row < dayOfWeek; row++) {
        const cellDate = new Date(thisMonday);
        cellDate.setDate(cellDate.getDate() + row);
        cellDate.setHours(0, 0, 0, 0);
        const dateStr = getLocalDateString(cellDate);
        const count = perDay.get(dateStr) || 0;
        partialCol.push({ date: dateStr, count });

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

    return { grid, stats: { total, activeDays, streak }, monthLabels };
  }, [pomodoroLogs, weeks]);

  const totalWeeks = grid.length;
  const gridW = totalWeeks * STEP;
  const gridH = 7 * STEP;
  const totalSvgW = LABEL_WIDTH + gridW;
  const totalSvgH = MONTH_LABEL_HEIGHT + gridH;

  // GitHub 经典: 显示一三五(一/三/五)
  const dayLabels = [
    { label: "一", offset: 0 },
    { label: "三", offset: 2 },
    { label: "五", offset: 4 },
  ];

  return (
    <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-4 shadow-2xs select-none">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#A34E36]" />
          <span className="text-[10px] font-black text-[#8B6E3C] tracking-widest uppercase">专注热力图</span>
        </div>
        <div className="flex items-center gap-2.5 text-[9px] font-bold text-slate-500">
          <span>
            近 {weeks} 周 · <span className="text-[#4D7C5D]">{stats.total}</span> 个番茄
          </span>
          <span className="text-[#EFEBE4]">|</span>
          <span>
            活跃 <span className="text-[#4D7C5D]">{stats.activeDays}</span> 天
          </span>
          {stats.streak > 0 && (
            <>
              <span className="text-[#EFEBE4]">|</span>
              <span>
                连续 <span className="text-[#A34E36]">{stats.streak}</span> 天 🔥
              </span>
            </>
          )}
        </div>
      </div>

      {/* SVG 热力图 — 纯 GitHub 风格 */}
      <svg width={totalSvgW} height={totalSvgH} className="overflow-visible block mx-auto">
        {/* 月份标签 */}
        {monthLabels.map((m, i) => (
          <text
            key={i}
            x={LABEL_WIDTH + m.colIndex * STEP + CELL_SIZE / 2}
            y={8}
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
            x={6}
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
              rx={2}
              ry={2}
              className={`${LEVEL_COLORS[getLevel(cell.count)]} transition-all duration-200 hover:brightness-110 cursor-help`}
            >
              <title>{`${cell.date} · ${cell.count} 个番茄`}</title>
            </rect>
          ))
        )}
      </svg>

      {/* 图例 */}
      <div className="flex items-center justify-end gap-1 mt-2 text-[8px] text-slate-400 font-bold">
        <span>少</span>
        {LEVEL_COLORS.map((cls, i) => (
          <div key={i} className={`w-[10px] h-[10px] rounded-[2px] ${cls}`} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Download, Sparkles, Heart } from "lucide-react";
import type { JournalEntry } from "../../types";

interface MoodPixelCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  journal: JournalEntry[];
  onSelectDate: (date: string) => void;
}

const MOOD_COLOR_MAP: Record<string, { bg: string; text: string; label: string; darkBg: string }> = {
  "😄": { bg: "#52B788", text: "#FFFFFF", label: "很棒", darkBg: "#40916C" },
  "😊": { bg: "#95D5B2", text: "#1B4332", label: "不错", darkBg: "#74C69D" },
  "😐": { bg: "#E9D8A6", text: "#6B5824", label: "一般", darkBg: "#D4A373" },
  "😔": { bg: "#F4A261", text: "#FFFFFF", label: "不好", darkBg: "#E76F51" },
  "😞": { bg: "#9B5DE5", text: "#FFFFFF", label: "很差", darkBg: "#7209B7" },
};

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月"
];

export const MoodPixelCanvas: React.FC<MoodPixelCanvasProps> = ({
  isOpen,
  onClose,
  journal,
  onSelectDate,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [hoveredCell, setHoveredCell] = useState<{ date: string; mood?: string; entryTitle?: string } | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  // 日记中已记录日期的映射表
  const entryMap = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    journal.forEach((item) => {
      if (item.isDaily && item.date) {
        map.set(item.date, item);
      }
    });
    return map;
  }, [journal]);

  // 当年各月份天数
  const daysInMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => new Date(selectedYear, m + 1, 0).getDate());
  }, [selectedYear]);

  // 统计当年情绪数据
  const moodStats = useMemo(() => {
    let totalDaysWithMood = 0;
    const counts: Record<string, number> = { "😄": 0, "😊": 0, "😐": 0, "😔": 0, "😞": 0 };

    journal.forEach((item) => {
      if (item.isDaily && item.date && item.date.startsWith(`${selectedYear}-`) && item.mood && counts[item.mood] !== undefined) {
        counts[item.mood]++;
        totalDaysWithMood++;
      }
    });

    return { total: totalDaysWithMood, counts };
  }, [journal, selectedYear]);

  if (!isOpen) return null;

  // 导出图片到本地 PNG
  const handleExportPoster = () => {
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const scale = 2; // 高清视网膜绘制
      const width = 640;
      const height = 880;
      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);

      // 背景 (温暖米杏色手帐底纸)
      ctx.fillStyle = "#FAF7F2";
      ctx.fillRect(0, 0, width, height);

      // 顶部边框与装饰
      ctx.fillStyle = "#4D7C5D";
      ctx.fillRect(32, 28, 4, 32);

      // 标题
      ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#2D323A";
      ctx.fillText(`${selectedYear} 年度情绪画卷 · Year in Pixels`, 44, 46);

      ctx.font = "12px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#8B7E6F";
      ctx.fillText(`橦云手帐 · 记录生活的每一次微光 · 共记录 ${moodStats.total} 天`, 44, 68);

      // 情绪色例图例
      let legendX = 44;
      const legendY = 96;
      Object.entries(MOOD_COLOR_MAP).forEach(([emoji, info]) => {
        ctx.fillStyle = info.bg;
        ctx.beginPath();
        ctx.roundRect(legendX, legendY, 12, 12, 3);
        ctx.fill();

        ctx.font = "11px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "#555A64";
        ctx.fillText(`${emoji} ${info.label} (${moodStats.counts[emoji] || 0})`, legendX + 16, legendY + 10);
        legendX += 105;
      });

      // 像素网格区域
      const gridStartX = 60;
      const gridStartY = 135;
      const cellSize = 13;
      const cellGap = 4;

      // 绘制月份表头
      ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#8B7E6F";
      ctx.textAlign = "center";
      for (let m = 0; m < 12; m++) {
        const x = gridStartX + m * (cellSize + cellGap) * 2.7 + (cellSize + cellGap);
        ctx.fillText(`${m + 1}月`, x, gridStartY - 10);
      }

      // 绘制 31 天
      for (let d = 1; d <= 31; d++) {
        const y = gridStartY + (d - 1) * (cellSize + cellGap);
        // 左侧日期标号
        ctx.font = "9px system-ui, sans-serif";
        ctx.fillStyle = "#A89F91";
        ctx.textAlign = "right";
        ctx.fillText(`${d}`, gridStartX - 10, y + 10);

        for (let m = 0; m < 12; m++) {
          const maxDays = daysInMonths[m];
          const x = gridStartX + m * (cellSize + cellGap) * 2.7;

          if (d <= maxDays) {
            const dateStr = `${selectedYear}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const entry = entryMap.get(dateStr);
            const mood = entry?.mood;
            const color = mood && MOOD_COLOR_MAP[mood] ? MOOD_COLOR_MAP[mood].bg : "#EDE6DA";

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x, y, cellSize * 2.2, cellSize, 3);
            ctx.fill();
          }
        }
      }

      // 底部水印印章
      ctx.textAlign = "left";
      ctx.font = "italic 11px Georgia, serif";
      ctx.fillStyle = "#B3A898";
      ctx.fillText("🌿 岁月温润，向光而生 · Aero Planner", 44, height - 32);

      // 导出下载
      const link = document.createElement("a");
      link.download = `Aero-Year-In-Pixels-${selectedYear}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs select-none animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#FAF8F5] dark:bg-[#1C1E24] border border-[#E8E2D5] dark:border-[#2D3038] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E2D5] dark:border-[#2D3038] bg-white/70 dark:bg-[#22242B]/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#E8F3EB] dark:bg-[#1E3024] flex items-center justify-center text-[#4D7C5D] dark:text-[#78C496]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  年度情绪像素画卷
                </h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#4D7C5D]/10 text-[#4D7C5D] dark:text-[#78C496]">
                  Year in Pixels
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                记录一整年的心境起伏，让每一个普通的日子都有色彩
              </p>
            </div>
          </div>

          {/* 年份切换 & 导出按钮 & 关闭 */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center rounded-xl border border-[#E8E2D5] dark:border-[#383A42] bg-white dark:bg-[#1A1C21] p-0.5">
              <button
                type="button"
                onClick={() => setSelectedYear((y) => y - 1)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="上一年"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-3 text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
                {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => setSelectedYear((y) => y + 1)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="下一年"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportPoster}
              disabled={exporting}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#4D7C5D] hover:bg-[#3F684C] text-white shadow-xs cursor-pointer transition-colors"
              title="导出高清长图分享"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? "正在生成..." : "导出画卷海报"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 统计横条 */}
        <div className="px-6 py-3 border-b border-[#E8E2D5] dark:border-[#2D3038] bg-[#F7F4EE]/60 dark:bg-[#202228]/60 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              年度心境足迹:
            </span>
            <span className="text-xs font-bold text-[#4D7C5D] dark:text-[#78C496]">
              {moodStats.total} / {daysInMonths.reduce((a, b) => a + b, 0)} 天已写下心情
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {Object.entries(MOOD_COLOR_MAP).map(([emoji, info]) => {
              const count = moodStats.counts[emoji] || 0;
              const pct = moodStats.total > 0 ? Math.round((count / moodStats.total) * 100) : 0;
              return (
                <div key={emoji} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: info.bg }}
                  />
                  <span className="text-slate-600 dark:text-slate-300 font-medium text-[11px]">
                    {emoji} {info.label}
                  </span>
                  <span className="text-slate-400 text-[10px] font-mono">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 12个月 x 31日 像素色块矩阵容器 */}
        <div className="flex-1 overflow-auto p-6 custom-scrollbar relative">
          <div className="min-w-[680px]">
            {/* 月份表头 */}
            <div className="grid grid-cols-[36px_repeat(12,1fr)] gap-2 mb-2 items-center text-center">
              <span className="text-[10px] font-mono text-slate-400">日\月</span>
              {MONTH_NAMES.map((m) => (
                <span key={m} className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {m}
                </span>
              ))}
            </div>

            {/* 31 天行 */}
            <div className="space-y-1.5">
              {Array.from({ length: 31 }, (_, dayIdx) => {
                const dayNum = dayIdx + 1;
                return (
                  <div key={dayNum} className="grid grid-cols-[36px_repeat(12,1fr)] gap-2 items-center">
                    {/* 日期数字列 */}
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 text-right pr-2">
                      {dayNum}
                    </span>

                    {/* 12个月的对应格子 */}
                    {Array.from({ length: 12 }, (_, monthIdx) => {
                      const maxDays = daysInMonths[monthIdx];
                      if (dayNum > maxDays) {
                        // 该月没有此日 (例如2月30日)
                        return (
                          <div
                            key={monthIdx}
                            className="h-4 rounded-md bg-transparent opacity-0 pointer-events-none"
                          />
                        );
                      }

                      const dateStr = `${selectedYear}-${String(monthIdx + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                      const entry = entryMap.get(dateStr);
                      const mood = entry?.mood;
                      const hasMood = mood && MOOD_COLOR_MAP[mood];
                      const colorInfo = hasMood ? MOOD_COLOR_MAP[mood] : null;

                      return (
                        <div
                          key={monthIdx}
                          onClick={() => {
                            onSelectDate(dateStr);
                            onClose();
                          }}
                          onMouseEnter={() =>
                            setHoveredCell({
                              date: dateStr,
                              mood,
                              entryTitle: entry?.content ? entry.content.slice(0, 40) : undefined,
                            })
                          }
                          onMouseLeave={() => setHoveredCell(null)}
                          className="h-4 rounded-md transition-all duration-150 cursor-pointer hover:scale-115 hover:z-10 hover:shadow-md relative group flex items-center justify-center border border-black/5 dark:border-white/5"
                          style={{
                            backgroundColor: colorInfo
                              ? colorInfo.bg
                              : undefined,
                          }}
                        >
                          {!colorInfo && (
                            <div className="w-full h-full rounded-md bg-[#EDE8DF] dark:bg-[#252830] opacity-70 group-hover:opacity-100" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 底部浮动悬浮卡 (Tooltip/Status) */}
        <div className="px-6 py-2.5 bg-white/80 dark:bg-[#202228]/80 border-t border-[#E8E2D5] dark:border-[#2D3038] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-[#E07A5F]" />
            {hoveredCell ? (
              <span>
                <strong className="text-slate-700 dark:text-slate-200 font-mono mr-1.5">
                  {hoveredCell.date}
                </strong>
                {hoveredCell.mood && MOOD_COLOR_MAP[hoveredCell.mood] ? (
                  <span className="font-bold text-[#4D7C5D] dark:text-[#78C496]">
                    {hoveredCell.mood} {MOOD_COLOR_MAP[hoveredCell.mood].label}
                  </span>
                ) : (
                  <span className="text-slate-400">未记录心情</span>
                )}
                {hoveredCell.entryTitle && (
                  <span className="text-slate-400 italic ml-2 truncate max-w-sm inline-block align-bottom">
                    “{hoveredCell.entryTitle}…”
                  </span>
                )}
              </span>
            ) : (
              <span>将鼠标悬浮在格子上查看该日心情，点击格子可直接翻到那一天手帐</span>
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            🌿 Aero Planner · 情绪足迹
          </span>
        </div>

      </div>
    </div>
  );
};

import React from "react";
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from "framer-motion";
import { Check, Clock, Heart, Sparkles, Info } from "lucide-react";
import { CATEGORY_META, PLANNER_COLORS, getDueDateCountdown } from "../constants";
import type { Task } from "../types";
import { audioEngine } from "../utils/audioEngine";
import { useTranslation } from "../i18n/LanguageContext";

export type { Task } from "../types";

interface SwipeCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
  onSnooze: (taskId: string) => void;
  progressPercentage?: number;
  qColors?: {
    "urgent-important": string;
    "important-not-urgent": string;
    "urgent-not-important": string;
    "not-urgent-not-important": string;
  };
  cardBackground?: "white" | "grid" | "lined" | "watercolor" | "doodle";
  onStartFocus?: (taskId: string, taskTitle: string) => void;
  onToggleFavorite?: (taskId: string) => void;
  onTaskClick?: (task: Task) => void;
}

export const SwipeCard: React.FC<SwipeCardProps> = ({
  task,
  onComplete,
  onSnooze,
  progressPercentage,
  qColors,
  cardBackground,
  onStartFocus,
  onToggleFavorite,
  onTaskClick,
}) => {
  const { t } = useTranslation();
  const tc = t.taskCard;
  const x = useMotionValue(0);
  const controls = useAnimation();

  // 灵敏自然的微旋转
  const rotate = useTransform(x, [-180, 180], [-8, 8]);

  // 自然减淡不透明度
  const opacity = useTransform(x, [-240, -160, 0, 160, 240], [0.35, 0.9, 1, 0.9, 0.35]);
  const scale = useTransform(x, [-160, 0, 160], [0.97, 1, 0.97]);

  // 滑动指示器透明度与微缩放
  const completeOpacity = useTransform(x, [0, 80], [0, 1]);
  const completeScale = useTransform(x, [0, 120], [0.85, 1]);

  const snoozeOpacity = useTransform(x, [-80, 0], [1, 0]);
  const snoozeScale = useTransform(x, [-120, 0], [1, 0.85]);

  // 动态卡片边框：根据滑动方向微微变色
  const borderStyle = useTransform(
    x,
    [-120, 0, 120],
    ["rgba(213, 192, 178, 0.5)", "rgba(238, 235, 230, 0.9)", "rgba(196, 215, 178, 0.8)"],
  );

  const handleDragEnd = async (_event: any, info: PanInfo) => {
    const threshold = 120;
    const swipeOffset = info.offset.x;

    if (swipeOffset > threshold) {
      await controls.start({
        x: 360,
        opacity: 0,
        scale: 0.92,
        transition: { duration: 0.2, ease: "easeOut" },
      });
      onComplete(task.id);
    } else if (swipeOffset < -threshold) {
      await controls.start({
        x: -360,
        opacity: 0,
        scale: 0.92,
        transition: { duration: 0.2, ease: "easeOut" },
      });
      onSnooze(task.id);
    } else {
      controls.start({
        x: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 350, damping: 25 },
      });
    }
  };

  // 象限配色，柔和手账调
  const categoryMeta = CATEGORY_META[task.category];
  const colorKey = qColors ? qColors[task.category] : null;
  const plannerColor = colorKey ? PLANNER_COLORS[colorKey] : null;

  const dotColorClass = plannerColor ? plannerColor.dot : categoryMeta.dot;
  const textColorClass = plannerColor ? plannerColor.text : categoryMeta.text;
  const tagBgClass = plannerColor ? plannerColor.bg : "bg-[#FAF8F5]";
  const tagBorderClass = plannerColor ? plannerColor.border : "border-[#EFEBE4]";

  const bgClassMap = {
    white: "bg-white",
    grid: "bg-grid-pattern",
    lined: "bg-lined-pattern",
    watercolor: "bg-watercolor-pattern",
    doodle: "bg-doodle-pattern",
  };
  const cardBgClass = bgClassMap[cardBackground || "white"];

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="relative w-full h-[225px] flex items-center justify-center select-none overflow-hidden"
    >
      {/* 动作状态背景：右侧绿色“完成” */}
      <motion.div
        style={{ opacity: completeOpacity, scale: completeScale }}
        className="absolute inset-y-4 left-6 right-6 rounded-2xl bg-[#F0F5F1] border border-[#DEEAE2] flex items-center justify-start pl-8 text-[#4D7C5D] gap-2 pointer-events-none shadow-[inset_0_2px_8px_rgba(77,124,93,0.02)]"
      >
        <div className="w-7 h-7 rounded-full bg-[#C4D7B2] flex items-center justify-center shadow-[0_3px_10px_rgba(196,215,178,0.3)]">
          <Check className="w-3.5 h-3.5 text-[#4D7C5D] animate-pulse" />
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase">Complete</span>
      </motion.div>

      {/* 动作状态背景：左侧红色“延后” */}
      <motion.div
        style={{ opacity: snoozeOpacity, scale: snoozeScale }}
        className="absolute inset-y-4 left-6 right-6 rounded-2xl bg-[#FCF2F0] border border-[#F5DFDB] flex items-center justify-end pr-8 text-[#A34E36] gap-2 pointer-events-none shadow-[inset_0_2px_8px_rgba(163,78,54,0.02)]"
      >
        <span className="text-[10px] font-bold tracking-wider uppercase">Snooze</span>
        <div className="w-7 h-7 rounded-full bg-[#E8A0BF] flex items-center justify-center shadow-[0_3px_10px_rgba(232,160,191,0.3)]">
          <Clock className="w-3.5 h-3.5 text-[#A34E36] animate-pulse" />
        </div>
      </motion.div>

      {/* 可拖拽核心卡片 */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -220, right: 220 }}
        dragElastic={0.45}
        onDragEnd={handleDragEnd}
        onDragStart={() => audioEngine.playPaperSwipeSound()}
        animate={controls}
        style={{ x, rotate, opacity, scale, borderColor: borderStyle }}
        whileDrag={{ scale: 1.02, boxShadow: "0 15px 30px -5px rgba(154,142,128,0.18)" }}
        className={`absolute w-[280px] h-[195px] rounded-2xl p-5 flex flex-col justify-between cursor-grab active:cursor-grabbing shadow-[0_12px_30px_rgba(154,142,128,0.12)] border border-[#EFEBE4] transition-all duration-300 ${cardBgClass}`}
      >
        {cardBackground === "doodle" && (
          <div className="absolute right-4 bottom-14 opacity-10 pointer-events-none select-none text-slate-700">
            <Sparkles className="w-12 h-12" />
          </div>
        )}

        {/* 卡片顶部标签 */}
        <div className="flex items-center justify-between">
          <div
            className={`flex items-center gap-2 px-2.5 py-0.5 rounded-full ${tagBgClass} border ${tagBorderClass}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotColorClass}`} />
            <span
              className={`text-[8px] font-extrabold uppercase tracking-wider ${textColorClass}`}
            >
              {categoryMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 到期倒计时 */}
            {(() => {
              const countdown = getDueDateCountdown(task.dueDate, task.dueTime);
              if (!countdown) return null;
              const badgeClass = countdown.isOverdue
                ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] font-extrabold"
                : countdown.isToday
                  ? "bg-[#FBECE5] border-[#F6DCD2] text-[#A64424] font-extrabold"
                  : "bg-[#FAF5ED] border-[#EFE5D3] text-[#8B6E3C]";
              return (
                <span className={`text-[7.5px] px-1.5 py-0.5 rounded border ${badgeClass}`}>
                  {countdown.text}
                </span>
              );
            })()}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(task.id);
              }}
              className="hover:scale-110 transition-transform cursor-pointer"
              title={task.isFavorite ? tc.unfavorite : tc.favorite}
            >
              <Heart
                className={`w-3.5 h-3.5 text-[#E8A0BF] transition-colors ${
                  task.isFavorite ? "fill-[#E8A0BF]" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* 卡片主内容 */}
        <div className="flex-grow flex flex-col justify-center my-1.5">
          <h3 className="text-sm font-bold text-[#2D323A] line-clamp-2 leading-snug tracking-tight">
            {task.title}
          </h3>
          {task.description && (
            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed font-medium">
              {task.description}
            </p>
          )}
          {task.notes && (
            <p className="text-[10px] text-[#8B6E3C] mt-1.5 line-clamp-2 leading-relaxed italic font-semibold whitespace-pre-wrap">
              {tc.notes}: {task.notes}
            </p>
          )}
        </div>

        {/* 进度条显示 */}
        {progressPercentage !== undefined && (
          <div className="w-full mb-1">
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden border border-slate-200/20">
              <div
                className="h-full bg-gradient-to-r from-[#B2C8DF] via-[#C4D7B2] to-[#E8A0BF] transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[7px] text-slate-400 mt-0.5 font-extrabold uppercase tracking-wider">
              <span>{tc.todayProgress}</span>
              <span className="text-slate-600">{progressPercentage}%</span>
            </div>
          </div>
        )}

        {/* 底部引导栏 */}
        <div className="flex items-center justify-between border-t border-[#FAF8F5] pt-2 text-[8px] text-slate-400 tracking-wider font-bold">
          <span className="flex items-center gap-0.5">
            <span className="text-[#A34E36]">←</span> {tc.swipeLeft}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTaskClick?.(task);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#EFEBE4] bg-white hover:bg-[#EEEAF5] hover:text-[#7C5D9E] text-slate-500 font-extrabold cursor-pointer transition-colors"
              title={tc.detail}
            >
              <Info className="w-2.5 h-2.5" />
              <span>{tc.detail}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartFocus?.(task.id, task.title);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#EFEBE4] bg-white hover:bg-[#F0F5F1] hover:text-[#4D7C5D] text-slate-500 font-extrabold cursor-pointer transition-colors"
              title={tc.startFocus}
            >
              <Clock className="w-2.5 h-2.5" />
              <span>{tc.focus}</span>
            </button>
          </div>
          <span className="flex items-center gap-0.5">
            {tc.swipeRight} <span className="text-[#4D7C5D]">→</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
};

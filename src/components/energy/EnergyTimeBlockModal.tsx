import React, { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Clock, Play, X, Flame, Coffee, Sparkles } from "lucide-react";
import type { Task } from "../../types";
import { ENERGY_ZONES, getCurrentEnergyZone, inferTaskEnergyLevel } from "../../utils/energyFlow";
import { audioEngine } from "../../utils/audioEngine";

interface EnergyTimeBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onStartFocus: (taskId: string, taskTitle: string) => void;
  onUpdateTask: (task: Task) => void;
}

export const EnergyTimeBlockModal: React.FC<EnergyTimeBlockModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onStartFocus,
  onUpdateTask,
}) => {
  const currentZone = getCurrentEnergyZone();
  const [activeTab, setActiveTab] = useState<string>(currentZone.id);

  if (!isOpen) return null;

  const energyLevelIcons = {
    high: <Flame className="w-3.5 h-3.5 text-rose-500" />,
    medium: <Sparkles className="w-3.5 h-3.5 text-indigo-500" />,
    low: <Coffee className="w-3.5 h-3.5 text-emerald-500" />,
  };

  const setTaskEnergy = (task: Task, level: "high" | "medium" | "low") => {
    onUpdateTask({ ...task, energyLevel: level });
    audioEngine.playStickSound();
  };

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-2xl bg-[#FDFBF7] dark:bg-[#1E2026] border border-[#EBE5D8] dark:border-[#33353A] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#2D323A] dark:text-slate-100"
      >
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-[#EFEBE4] dark:border-[#2C2E36] flex items-center justify-between bg-white/40 dark:bg-[#252830]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">精力潮汐与时间盒 (Energy Flow)</h2>
              <p className="text-[10px] text-slate-400">顺应生理节律排布待办：在对的精力时间做对的事</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2A2D35] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 精力潮汐时间轴标签栏 */}
        <div className="px-6 pt-3 pb-2 border-b border-[#EFEBE4] dark:border-[#2C2E36] grid grid-cols-5 gap-1.5 bg-slate-50/50 dark:bg-[#17181C]/50 overflow-x-auto">
          {ENERGY_ZONES.map((zone) => {
            const isCurrent = currentZone.id === zone.id;
            const isSelected = activeTab === zone.id;
            return (
              <button
                key={zone.id}
                onClick={() => {
                  setActiveTab(zone.id);
                  audioEngine.playPaperSwipeSound();
                }}
                className={`px-2.5 py-2 rounded-xl text-left transition-all border relative cursor-pointer ${
                  isSelected
                    ? "bg-white dark:bg-[#262830] border-rose-300 dark:border-rose-800 shadow-sm"
                    : "bg-transparent border-transparent hover:bg-white/60 dark:hover:bg-[#262830]/50"
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-1.5 right-1.5 px-1.5 py-0.2 bg-rose-600 text-[8px] text-white font-extrabold rounded-full">
                    当前
                  </span>
                )}
                <div className={`text-[10px] font-bold truncate ${zone.colorClass}`}>
                  {zone.name.split(" ")[0]}
                </div>
                <div className="text-[9px] text-slate-400 font-mono mt-0.5">{zone.timeRange}</div>
              </button>
            );
          })}
        </div>

        {/* 选中的精力区间详情与匹配任务 */}
        <div className="p-6 overflow-y-auto flex-grow custom-scrollbar space-y-4">
          {(() => {
            const zone = ENERGY_ZONES.find((z) => z.id === activeTab) || currentZone;
            const matchedTasks = tasks.filter((t) => inferTaskEnergyLevel(t) === zone.recommendedLevel);
            const otherTasks = tasks.filter((t) => inferTaskEnergyLevel(t) !== zone.recommendedLevel);

            return (
              <>
                {/* 时段特性横幅 */}
                <div className={`p-4 rounded-xl border ${zone.bgLightClass} space-y-1`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${zone.colorClass} flex items-center gap-1.5`}>
                      <Clock className="w-3.5 h-3.5" />
                      {zone.name}（{zone.timeRange}）
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      匹配能级：{zone.recommendedLevel === "high" ? "🔥 高能攻坚" : zone.recommendedLevel === "medium" ? "⚡ 常规思考" : "🍃 低耗琐碎"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{zone.description}</p>
                </div>

                {/* 推荐该时段攻坚的任务 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      推荐在此时间盒处理 ({matchedTasks.length})
                    </span>
                    <span className="text-[10px] text-slate-400">点击右侧按钮可直接开启专注</span>
                  </div>

                  {matchedTasks.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-[#33353A] text-center text-xs text-slate-400">
                      该能级暂无待办，可从下方其他任务中调整精力消耗标记
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {matchedTasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl bg-white dark:bg-[#262830] border border-[#EFEBE4] dark:border-[#33353A] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-3">
                            <span title={`当前能级：${t.energyLevel || "自动推断"}`}>
                              {energyLevelIcons[inferTaskEnergyLevel(t)]}
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold truncate block">{t.title}</span>
                              {t.dueDate && (
                                <span className="text-[10px] text-slate-400 font-mono">截止: {t.dueDate}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => {
                                onStartFocus(t.id, t.title);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#4D7C5D] hover:bg-[#3F684C] text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span>入盒专注</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 允许微调其他任务的精力标签 */}
                {otherTasks.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-[#2C2E36] space-y-2">
                    <span className="text-xs font-bold text-slate-500">快速归类其他任务精力标签</span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {otherTasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-2 rounded-lg bg-slate-50 dark:bg-[#252830] flex items-center justify-between text-xs"
                        >
                          <span className="truncate max-w-[260px] text-slate-600 dark:text-slate-300">
                            {t.title}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setTaskEnergy(t, "high")}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                t.energyLevel === "high"
                                  ? "bg-rose-500 text-white"
                                  : "text-slate-400 hover:text-rose-500"
                              }`}
                            >
                              🔥 高
                            </button>
                            <button
                              onClick={() => setTaskEnergy(t, "medium")}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                t.energyLevel === "medium"
                                  ? "bg-indigo-500 text-white"
                                  : "text-slate-400 hover:text-indigo-500"
                              }`}
                            >
                              ⚡ 中
                            </button>
                            <button
                              onClick={() => setTaskEnergy(t, "low")}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                t.energyLevel === "low"
                                  ? "bg-emerald-500 text-white"
                                  : "text-slate-400 hover:text-emerald-500"
                              }`}
                            >
                              🍃 低
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </motion.div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sunset, CheckCircle2, Clock, ArrowRight, Sparkles, Moon, X, Calendar, Compass } from "lucide-react";
import type { Task, PomodoroLog } from "../../types";
import { audioEngine } from "../../utils/audioEngine";
import { calculateSunsetStats, getTodayString, getTomorrowString } from "../../utils/sunsetShutdown";

interface SunsetShutdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  completedTasks: Task[];
  pomodoroLogs: PomodoroLog[];
  onUpdateTasks: (updatedTasks: Task[]) => void;
  onAppendJournalNote?: (text: string) => void;
  onMinimizeWindow?: () => void;
}

const SunsetShutdownModalContent: React.FC<Omit<SunsetShutdownModalProps, "isOpen">> = ({
  onClose,
  tasks,
  completedTasks,
  pomodoroLogs,
  onUpdateTasks,
  onAppendJournalNote,
  onMinimizeWindow,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [stampLanded, setStampLanded] = useState(false);
  const todayStr = getTodayString();
  const tomorrowStr = getTomorrowString();

  const stats = React.useMemo(
    () => calculateSunsetStats(tasks, completedTasks, pomodoroLogs, todayStr),
    [tasks, completedTasks, pomodoroLogs, todayStr],
  );

  const [selectedToPostpone, setSelectedToPostpone] = useState<Set<string>>(
    () => new Set(stats.uncompletedTasks.map((t) => t.id)),
  );
  const [launchpadText, setLaunchpadText] = useState(() => {
    const savedLaunchpad = localStorage.getItem("tongyun_tomorrow_launchpad");
    if (savedLaunchpad) {
      try {
        const parsed = JSON.parse(savedLaunchpad);
        if (parsed.date === tomorrowStr) return parsed.text || "";
      } catch {
        // ignore
      }
    }
    return "";
  });

  // 延迟 450ms 盖章
  useEffect(() => {
    const timer = setTimeout(() => {
      setStampLanded(true);
      audioEngine.playStampSound();
    }, 450);
    return () => clearTimeout(timer);
  }, []);

  // 执行顺延至明日
  const handleExecutePostpone = () => {
    if (selectedToPostpone.size > 0) {
      const updated = tasks.map((t) => {
        if (selectedToPostpone.has(t.id)) {
          return { ...t, dueDate: tomorrowStr };
        }
        return t;
      });
      onUpdateTasks(updated);
      audioEngine.playPaperSwipeSound();
    }
    setStep(3);
  };

  // 保存明日启动锚点
  const handleSaveLaunchpad = () => {
    if (launchpadText.trim()) {
      localStorage.setItem(
        "tongyun_tomorrow_launchpad",
        JSON.stringify({ date: tomorrowStr, text: launchpadText.trim() }),
      );
      if (onAppendJournalNote) {
        onAppendJournalNote(`\n\n> 🌅 **日落离线 · 明日启动锚点**：${launchpadText.trim()}`);
      }
    }
    // 标记今天已经做过日落离线
    localStorage.setItem("tongyun_last_sunset_date", todayStr);
    audioEngine.playCompletionSound("bell");
    setStep(4);
  };

  const toggleSelectTask = (id: string) => {
    setSelectedToPostpone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-md p-4 animate-fade-in select-none cursor-pointer"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="w-full max-w-xl bg-[#FDFBF7] dark:bg-[#1E2026] border border-[#EBE5D8] dark:border-[#33353A] rounded-2xl shadow-2xl overflow-hidden relative text-[#2D323A] dark:text-slate-100 flex flex-col max-h-[85vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部晚霞流光饰条 */}
        <div className="h-2 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />

        {/* 顶栏 */}
        <div className="px-6 py-4 border-b border-[#EFEBE4] dark:border-[#2C2E36] flex items-center justify-between bg-white/40 dark:bg-[#252830]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Sunset className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">日落离线仪轨 · 晚安手帐</h2>
              <p className="text-[10px] text-slate-400">卸下载荷，整理今日所得，体面告别工作日</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭日落离线"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2A2D35] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体步骤内容 */}
        <div className="p-6 overflow-y-auto flex-grow custom-scrollbar">
          {/* 步骤 1：清点今日收获 */}
          {step === 1 && (
            <div className="space-y-6 text-center">
              <div className="pt-2">
                <span className="text-xs uppercase font-extrabold tracking-widest text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 rounded-full">
                  STEP 1 / 3 · 今日清点
                </span>
                <h3 className="text-lg font-bold mt-2">辛苦了一整天，先看看今日的耕耘</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  每个微小的推进，都是今天实打实的成长
                </p>
              </div>

              {/* 核心收获数据卡 */}
              <div className="grid grid-cols-3 gap-3 py-2">
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#262830] border border-[#EFEBE4] dark:border-[#33353A] flex flex-col items-center shadow-sm">
                  <CheckCircle2 className="w-5 h-5 text-[#4D7C5D] mb-1.5" />
                  <span className="text-2xl font-black font-mono text-[#4D7C5D]">
                    {stats.completedCount}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">今日完成任务</span>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#262830] border border-[#EFEBE4] dark:border-[#33353A] flex flex-col items-center shadow-sm">
                  <Clock className="w-5 h-5 text-amber-500 mb-1.5" />
                  <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                    {stats.totalFocusMinutes}
                    <span className="text-xs ml-0.5">m</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">专注心流时长</span>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#262830] border border-[#EFEBE4] dark:border-[#33353A] flex flex-col items-center shadow-sm">
                  <Sparkles className="w-5 h-5 text-rose-500 mb-1.5" />
                  <span className="text-2xl font-black font-mono text-rose-500">
                    {stats.pomodoroCount}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">完成番茄钟</span>
                </div>
              </div>

              {/* 朱砂红「今日圆满」复古印章 */}
              <div className="h-28 flex items-center justify-center relative">
                <AnimatePresence>
                  {stampLanded && (
                    <motion.div
                      initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
                      animate={{ scale: 1, opacity: 1, rotate: -8 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      className="border-3 border-[#A33A2C] text-[#A33A2C] px-5 py-2 rounded-xl font-serif font-black tracking-widest text-lg shadow-inner bg-[#A33A2C]/5 select-none relative"
                      style={{ textShadow: "0 0 1px rgba(163,58,44,0.4)" }}
                    >
                      <div className="border border-[#A33A2C]/60 px-4 py-1.5 rounded-lg flex items-center gap-1.5">
                        <span className="text-sm">★</span>
                        <span>今日圆满</span>
                        <span className="text-sm">★</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-2.5 rounded-xl bg-[#4D7C5D] hover:bg-[#3F684C] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <span>下一步：安顿游离待办</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 步骤 2：安顿游离待办 */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <span className="text-xs uppercase font-extrabold tracking-widest text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 rounded-full">
                  STEP 2 / 3 · 安顿未完成
                </span>
                <h3 className="text-base font-bold mt-2">不要把悬而未决的任务留在脑子里</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  未完成很正常。勾选的任务将一键顺延至明日，让今晚安心休息。
                </p>
              </div>

              {stats.uncompletedTasks.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-white dark:bg-[#262830] border border-[#EFEBE4] dark:border-[#33353A] space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#4D7C5D] mx-auto" />
                  <p className="text-sm font-bold text-[#4D7C5D]">太赞了！今日截止待办已全部清空！</p>
                  <p className="text-xs text-slate-400">没有任何悬空任务打扰你的夜晚。</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                  {stats.uncompletedTasks.map((t) => {
                    const isChecked = selectedToPostpone.has(t.id);
                    return (
                      <div
                        key={t.id}
                        onClick={() => toggleSelectTask(t.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                          isChecked
                            ? "bg-orange-50/60 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800"
                            : "bg-white dark:bg-[#262830] border-slate-200 dark:border-[#33353A] opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-3.5 h-3.5 rounded accent-orange-600 cursor-pointer"
                          />
                          <span className="font-medium truncate">{t.title}</span>
                        </div>
                        <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold flex items-center gap-1 flex-shrink-0">
                          <Calendar className="w-3 h-3" />
                          <span>顺延至明日 ({tomorrowStr})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#33353A] text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#262830] transition-colors cursor-pointer"
                >
                  上一步
                </button>
                <button
                  onClick={handleExecutePostpone}
                  className="flex-grow py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <span>
                    {selectedToPostpone.size > 0
                      ? `一键顺延 (${selectedToPostpone.size} 项) 并继续`
                      : "跳过顺延，继续下一步"}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 步骤 3：明日启动锚点 */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <span className="text-xs uppercase font-extrabold tracking-widest text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 rounded-full">
                  STEP 3 / 3 · 明日启动锚点
                </span>
                <h3 className="text-base font-bold mt-2">写下一句明天上班第一件要做的事</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  清晰的启动锚点能让明天的你 1 秒进入状态，彻底消除今晚的大脑内存占用。
                </p>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <Compass className="w-4 h-4 text-orange-500 absolute left-3 top-3.5" />
                  <textarea
                    value={launchpadText}
                    onChange={(e) => setLaunchpadText(e.target.value)}
                    placeholder="例：明天一早先拉取最新代码，跑通支付回调单测..."
                    rows={3}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-[#33353A] bg-white dark:bg-[#262830] text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:focus:ring-orange-500/40 resize-none font-sans"
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    "明天上午先把第 1 象限核心待办攻坚掉",
                    "复盘这周日记与专注热力图",
                    "把未完文档补充完闭环",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLaunchpadText(preset)}
                      className="px-2 py-1 rounded-md text-[10px] bg-slate-100 dark:bg-[#2A2D35] hover:bg-orange-50 dark:hover:bg-orange-950/30 text-slate-500 dark:text-slate-400 hover:text-orange-600 transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#33353A] text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#262830] transition-colors cursor-pointer"
                >
                  上一步
                </button>
                <button
                  onClick={handleSaveLaunchpad}
                  className="flex-grow py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <span>合上手帐 · 开启美好生活</span>
                  <Moon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 步骤 4：合上手帐晚安歇息 */}
          {step === 4 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-500 mx-auto flex items-center justify-center shadow-inner">
                <Moon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold font-serif">晚安，今日工作已体面收官</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  太阳已经下山，所有的事情明天都有安排。现在，请放下屏幕，去散步、去陪伴家人、去享受属于你的时间。
                </p>
              </div>

              {launchpadText.trim() && (
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-left max-w-sm mx-auto text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-bold flex items-center gap-1 mb-1">
                    <Compass className="w-3.5 h-3.5" />
                    明日启动锚点已就绪：
                  </span>
                  <span className="italic">{launchpadText.trim()}</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-3">
                {onMinimizeWindow && (
                  <button
                    onClick={() => {
                      onMinimizeWindow();
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#33353A] text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#262830] transition-colors cursor-pointer"
                  >
                    最小化休眠
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-[#4D7C5D] hover:bg-[#3F684C] text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  我知道了，合上手帐
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export const SunsetShutdownModal: React.FC<SunsetShutdownModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <SunsetShutdownModalContent {...props} />;
};

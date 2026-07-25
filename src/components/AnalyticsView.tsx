import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Clock, CheckCircle2, Heart, Coffee, Sun, Moon, Sunrise, Target, Sparkles, Tags, BrainCircuit } from "lucide-react";
import type { Task, PomodoroLog, CustomizationConfig } from "../types";
import { useTranslation } from "../i18n/LanguageContext";
import { getLocalDateString } from "../utils/date";
import { callAI, generateReport } from "../utils/aiEngine";
import { FocusHeatmap } from "./FocusHeatmap";

interface AnalyticsViewProps {
  pomodoroLogs: PomodoroLog[];
  tasks: Task[];
  completedTasks: Task[];
  customizationConfig?: CustomizationConfig;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = React.memo(({
  pomodoroLogs,
  tasks,
  completedTasks,
  customizationConfig,
}) => {
  const { t } = useTranslation(); const a = t.analytics; const m = t.matrix;

  const [dailyGoal, setDailyGoal] = useState(() => {
    const saved = localStorage.getItem("tongyun_daily_goal");
    return saved ? parseInt(saved, 10) : 4;
  });

  useEffect(() => {
    localStorage.setItem("tongyun_daily_goal", String(dailyGoal));
  }, [dailyGoal]);

  // AI 报告生成
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(() => {
    const cached = localStorage.getItem("tongyun_analytics_report");
    if (cached) {
      try { const parsed = JSON.parse(cached); if (parsed.date === getLocalDateString()) return parsed.content; } catch { /* ignore */ }
    }
    return null;
  });
  const [reportType, setReportType] = useState<"daily" | "weekly">("daily");

  const handleGenerateReport = async () => {
    if (!customizationConfig?.aiApiKey) return;
    setReportLoading(true);
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - (reportType === "weekly" ? 7 : 1) * 86400000);
      const recentCompleted = completedTasks.filter(t => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= weekAgo && d <= now;
      });
      const recentPomodoros = pomodoroLogs.filter(log => log.timestamp >= weekAgo.getTime() && log.timestamp <= now.getTime());
      const totalPomoMin = recentPomodoros.reduce((s, l) => s + l.duration, 0);
      const cats: Record<string, number> = {};
      recentCompleted.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });

      const content = await generateReport(customizationConfig!, reportType, {
        completedTasks: recentCompleted.length,
        pomodoroCount: recentPomodoros.length,
        pomodoroMinutes: totalPomoMin,
        taskCategories: cats,
      });
      setReportContent(content);
      localStorage.setItem("tongyun_analytics_report", JSON.stringify({ date: getLocalDateString(), content }));
    } catch (e) {
      console.error("生成报告失败", e);
    } finally {
      setReportLoading(false);
    }
  };

  const { totalHours, totalMinutes, todayPomodoros, avgDuration } = useMemo(() => {
    const totalDur = pomodoroLogs.reduce((acc, curr) => acc + curr.duration, 0);
    const hours = Math.floor(totalDur / 60);
    const minutes = totalDur % 60;
    const todayStr = getLocalDateString();
    const todayPomos = pomodoroLogs.filter((log) => {
      const logDate = getLocalDateString(new Date(log.timestamp));
      return logDate === todayStr;
    }).length;
    const avgDur = pomodoroLogs.length > 0 ? Math.round(totalDur / pomodoroLogs.length) : 0;
    return { totalHours: hours, totalMinutes: minutes, todayPomodoros: todayPomos, avgDuration: avgDur };
  }, [pomodoroLogs]);

  const { taskStatsList, maxDuration } = useMemo(() => {
    interface TaskStats { taskId: string; taskTitle: string; tomatoCount: number; totalDuration: number; }
    const taskStatsMap: { [key: string]: TaskStats } = {};
    pomodoroLogs.forEach((log) => {
      const tId = log.taskId || "general";
      const tTitle = log.taskTitle || a.untitledTask;
      if (!taskStatsMap[tId]) { taskStatsMap[tId] = { taskId: tId, taskTitle: tTitle, tomatoCount: 0, totalDuration: 0 }; }
      taskStatsMap[tId].tomatoCount += 1;
      taskStatsMap[tId].totalDuration += log.duration;
    });
    const sortedList = Object.values(taskStatsMap).sort((a, b) => b.totalDuration - a.totalDuration);
    const maxDur = sortedList.length > 0 ? sortedList[0].totalDuration : 1;
    return { taskStatsList: sortedList, maxDuration: maxDur };
  }, [pomodoroLogs]);

  const timeSlots = useMemo(() => {
    const slots = [
      { label: "清晨 (6-9)", icon: Sunrise, start: 6, end: 9, count: 0, color: "bg-[#B2C8DF]" },
      { label: "上午 (9-12)", icon: Sun, start: 9, end: 12, count: 0, color: "bg-[#C4D7B2]" },
      { label: "下午 (12-18)", icon: Clock, start: 12, end: 18, count: 0, color: "bg-[#E8A0BF]" },
      { label: "晚上 (18-24)", icon: Moon, start: 18, end: 24, count: 0, color: "bg-[#7C5D9E]" },
    ];
    pomodoroLogs.forEach((log) => {
      const hour = new Date(log.timestamp).getHours();
      const slot = slots.find((s) => hour >= s.start && hour < s.end);
      if (slot) slot.count++;
    });
    return slots;
  }, [pomodoroLogs]);

  const maxSlot = Math.max(...timeSlots.map((s) => s.count), 1);

  const goalStats = useMemo(() => {
    const perDay = new Map<string, number>();
    pomodoroLogs.forEach((log) => {
      const dateStr = getLocalDateString(new Date(log.timestamp));
      perDay.set(dateStr, (perDay.get(dateStr) || 0) + 1);
    });
    const todayStr = getLocalDateString();
    let streak = 0;
    const cursor = new Date();
    while (true) {
      const key = getLocalDateString(cursor);
      const count = perDay.get(key) || 0;
      if (count >= dailyGoal) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else break;
    }
    const totalDays = perDay.size;
    const goalDays = Array.from(perDay.values()).filter((c) => c >= dailyGoal).length;
    const goalRate = totalDays > 0 ? Math.round((goalDays / totalDays) * 100) : 0;
    const todayCount = perDay.get(todayStr) || 0;
    return { streak, totalDays, goalDays, goalRate, todayCount, perDay };
  }, [pomodoroLogs, dailyGoal]);

  const bestDay = useMemo(() => {
    let best = "";
    let bestCount = 0;
    goalStats.perDay.forEach((count, date) => {
      if (count > bestCount) { bestCount = count; best = date; }
    });
    return { date: best, count: bestCount };
  }, [goalStats.perDay]);

  // Tag-based focus stats
  const allTasks = useMemo(() => [...tasks, ...completedTasks], [tasks, completedTasks]);

  const tagStats = useMemo(() => {
    const tagMap = new Map<string, { count: number; totalDuration: number }>();
    pomodoroLogs.forEach((log) => {
      if (!log.taskId) return;
      const task = allTasks.find((t) => t.id === log.taskId);
      if (!task || !task.tags || task.tags.length === 0) return;
      task.tags.forEach((tag) => {
        const cur = tagMap.get(tag) || { count: 0, totalDuration: 0 };
        cur.count++;
        cur.totalDuration += log.duration;
        tagMap.set(tag, cur);
      });
    });
    return Array.from(tagMap.entries())
      .map(([tag, stats]) => ({ tag, ...stats }))
      .sort((a, b) => b.totalDuration - a.totalDuration);
  }, [pomodoroLogs, allTasks]);

  const maxTagDuration = tagStats.length > 0 ? tagStats[0].totalDuration : 1;

  // AI weekly summary
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const generateWeeklySummary = useCallback(async () => {
    if (!customizationConfig?.aiApiKey) {
      setAiError(a.aiWeeklyError);
      return;
    }
    setAiLoading(true);
    setAiError("");
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekLogs = pomodoroLogs.filter((log) => log.timestamp >= weekAgo.getTime());
    const totalSessions = weekLogs.length;
    const totalMin = weekLogs.reduce((acc, l) => acc + l.duration, 0);
    const daysActive = new Set(weekLogs.map((l) => getLocalDateString(new Date(l.timestamp)))).size;
    const topTasks = weekLogs.reduce<Record<string, number>>((acc, l) => {
      const key = l.taskTitle || a.untitledTask;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topTaskEntries = Object.entries(topTasks).sort(([, a], [, b]) => b - a).slice(0, 5);
    const taskSummary = topTaskEntries.map(([title, count]) => `${title}(${count}次)`).join("、");
    const userPrompt = `请用中文写一段本周专注总结（80-120字），语气温暖鼓励。数据如下：
- 总专注次数: ${totalSessions}
- 总专注时长: ${totalMin} 分钟
- 活跃天数: ${daysActive} 天
- 主要专注任务: ${taskSummary || "无"}`;

    try {
      const result = await callAI(customizationConfig, "你是一个温暖、简洁的专注力教练。请用中文总结，语气像朋友般自然。只返回总结文本，不要任何额外说明。", userPrompt);
      setAiSummary(result);
    } catch {
      setAiError(a.aiWeeklyError);
    } finally {
      setAiLoading(false);
    }
  }, [customizationConfig, pomodoroLogs, a]);

  const categories = [
    { id: "urgent-important", label: "I. " + m.urgentImportant, color: "bg-[#E8A0BF]", textColor: "text-[#A34E36]", bgClass: "bg-[#FCF2F0]" },
    { id: "important-not-urgent", label: "II. " + m.importantNotUrgent, color: "bg-[#C4D7B2]", textColor: "text-[#4D7C5D]", bgClass: "bg-[#F0F5F1]" },
    { id: "urgent-not-important", label: "III. " + m.urgentNotImportant, color: "bg-[#B2C8DF]", textColor: "text-[#5C528B]", bgClass: "bg-[#F3F2F7]" },
    { id: "not-urgent-not-important", label: "IV. " + m.notUrgentNotImportant, color: "bg-[#FAF5ED]/80", textColor: "text-[#8B6E3C]", bgClass: "bg-[#FAF5ED]" },
  ] as const;

  const allTotalCount = tasks.length + completedTasks.length;

  return (
    <div className="animate-fade-in-up flex flex-col gap-4 flex-grow z-10 relative select-none">
      {/* AI Report Card */}
      {customizationConfig?.aiApiKey && (
        <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-4 shadow-sm ">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#8B6E3C]" />
              <span className="text-[10px] font-bold text-[#8B6E3C] tracking-wide uppercase">AI 效率报告</span>
            </div>
            <div className="flex items-center gap-2">
              <select value={reportType} onChange={(e) => setReportType(e.target.value as "daily" | "weekly")} className="bg-[#FAF8F5] border border-[#EFEBE4] px-2 py-1 rounded-lg text-[9px] text-slate-700 font-bold focus:outline-none focus:border-[#C4D7B2]">
                <option value="daily">日报</option>
                <option value="weekly">周报</option>
              </select>
              <button onClick={handleGenerateReport} disabled={reportLoading} className={`text-[9px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${reportLoading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-[#4D7C5D]/10 text-[#4D7C5D] hover:bg-[#4D7C5D]/20'}`}>
                {reportLoading ? '生成中...' : '生成报告'}
              </button>
            </div>
          </div>
          {reportContent ? (
            <div className="text-[11px] text-slate-700 leading-relaxed prose-body [&>p]:mb-1 [&>h3]:text-xs [&>h3]:font-bold [&>h3]:text-[#4D7C5D] [&>h3]:mb-1 [&>ul]:text-[10px] [&>ul]:pl-4 [&>ul]:list-disc">
              {reportContent.split('\n').map((line, i) => {
                if (!line.trim()) return null;
                return <p key={i}>{line.replace(/^[#*_]+/g, '')}</p>;
              })}
            </div>
          ) : (
            <p className="text-[10px] text-slate-400 font-medium">点击生成 AI 效率报告，了解完成情况与建议</p>
          )}
        </div>
      )}

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#FCF2F0]/80 border border-[#F5DFDB] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#A34E36] shadow-sm">
            <Clock className="w-5 h-5 text-[#A34E36]" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold text-[#A34E36]/80 uppercase tracking-wider block">{a.totalHours}</span>
            <span className="text-xs font-bold text-[#2D323A] block truncate">{a.hoursMinutes.replace("{h}", String(totalHours)).replace("{m}", String(totalMinutes))}</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#F0F5F1]/80 border border-[#DEEAE2] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#4D7C5D] shadow-sm">
            <CheckCircle2 className="w-5 h-5 text-[#4D7C5D]" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold text-[#4D7C5D]/80 uppercase tracking-wider block">{a.totalSessions}</span>
            <span className="text-xs font-bold text-[#2D323A] block truncate">{a.sessionsCount.replace("{count}", String(pomodoroLogs.length))}</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#F3F2F7]/80 border border-[#E5E2EE] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#5C528B] shadow-sm">
            <Heart className="w-5 h-5 text-[#5C528B] fill-[#E8A0BF]/10" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold text-[#5C528B]/80 uppercase tracking-wider block">{a.todayFocus}</span>
            <span className="text-xs font-bold text-[#2D323A] block truncate">{a.count.replace("{count}", String(todayPomodoros))}</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#FAF5ED]/80 border border-[#EFE5D3] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#8B6E3C] shadow-sm">
            <Coffee className="w-5 h-5 text-[#8B6E3C]" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold text-[#8B6E3C]/80 uppercase tracking-wider block">{a.avgDuration}</span>
            <span className="text-xs font-bold text-[#2D323A] block truncate">{a.avgDurationValue.replace("{n}", String(avgDuration))}</span>
          </div>
        </div>
      </div>

      {/* Heatmap & Time Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <FocusHeatmap pomodoroLogs={pomodoroLogs} weeks={26} showStatsGlance={true} />
        </div>

        {/* 1. Time-of-day distribution */}
        <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 flex flex-col shadow-sm ">
          <div className="pb-3 border-b border-[#EFEBE4] mb-3">
            <h3 className="text-xs font-bold text-[#2D323A] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#7C5D9E]" />
              <span>{a.timeDist}</span>
            </h3>
          </div>
          <div className="space-y-3 flex-grow flex flex-col justify-center">
            {timeSlots.map((slot) => {
              const Icon = slot.icon;
              const pct = Math.round((slot.count / maxSlot) * 100);
              return (
                <div key={slot.label} className="flex items-center gap-2.5">
                  <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[9px] font-bold text-slate-600 w-20 shrink-0">{slot.label}</span>
                  <div className="flex-grow h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200/40">
                    <div className={`h-full rounded-full transition-all duration-500 ${slot.color}`} style={{ width: `${pct}%`, opacity: 0.6 }} />
                  </div>
                  <span className="text-[10px] font-extrabold text-slate-500 min-w-[24px] text-right">{slot.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>



      {/* 4. Daily goal progress */}
      <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 flex flex-col shadow-sm ">
        <div className="flex items-center justify-between pb-3.5 border-b border-[#EFEBE4] mb-4">
          <h3 className="text-xs font-bold text-[#2D323A] flex items-center gap-1.5">
            <Target className="w-4 h-4 text-[#A34E36]" />
            <span>{a.dailyGoal}</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-500">{a.dailyGoalLabel}</span>
            <div className="flex items-center gap-1 bg-[#FAF8F5] border border-[#EFEBE4] rounded-lg px-2 py-0.5">
              <button onClick={() => setDailyGoal(Math.max(1, dailyGoal - 1))} className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-700 cursor-pointer font-bold text-xs">-</button>
              <span className="text-[11px] font-extrabold text-[#4D7C5D] min-w-[16px] text-center">{dailyGoal}</span>
              <button onClick={() => setDailyGoal(Math.min(20, dailyGoal + 1))} className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-700 cursor-pointer font-bold text-xs">+</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-xl bg-[#F0F5F1]/60 border border-[#DEEAE2]">
            <span className="text-lg font-black text-[#4D7C5D]">{goalStats.todayCount}</span>
            <span className="text-[9px] font-bold text-slate-500 block mt-0.5">{a.todayCompleted}</span>
            {goalStats.todayCount >= dailyGoal && (
              <span className="text-[8px] text-[#4D7C5D] font-extrabold block mt-0.5">{a.goalReached}</span>
            )}
          </div>
          <div className="text-center p-3 rounded-xl bg-[#FCF2F0]/60 border border-[#F5DFDB]">
            <span className="text-lg font-black text-[#A34E36]">{goalStats.streak}</span>
            <span className="text-[9px] font-bold text-slate-500 block mt-0.5">{a.streakLabel}</span>
            {goalStats.streak > 0 && <span className="text-[8px] text-[#A34E36] font-extrabold block mt-0.5">{a.streakReached}</span>}
          </div>
          <div className="text-center p-3 rounded-xl bg-[#F3F2F7]/60 border border-[#E5E2EE]">
            <span className="text-lg font-black text-[#5C528B]">{goalStats.goalDays}</span>
            <span className="text-[9px] font-bold text-slate-500 block mt-0.5">{a.goalDaysLabel}</span>
          </div>
          <div className="text-center p-3 rounded-xl bg-[#FAF5ED]/60 border border-[#EFE5D3]">
            <span className="text-lg font-black text-[#8B6E3C]">{goalStats.goalRate}%</span>
            <span className="text-[9px] font-bold text-slate-500 block mt-0.5">{a.goalRateLabel}</span>
          </div>
        </div>
        {bestDay.count > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-[#EFEBE4] text-center">
            <span className="text-[9px] text-slate-500 font-medium">
              {a.bestDay.replace("{date}", bestDay.date).replace("{count}", String(bestDay.count))}
            </span>
          </div>
        )}
      </div>

      {/* Quadrant distribution + Tag stats + AI Weekly */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Quadrant distribution */}
          <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 flex flex-col shadow-sm ">
            <div className="pb-3.5 border-b border-[#EFEBE4] mb-4">
              <h3 className="text-xs font-bold text-[#2D323A] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#4D7C5D]" />
                <span>{a.quadrantDist}</span>
              </h3>
            </div>
            <div className="space-y-4">
              {categories.map((cat) => {
                const total = tasks.filter((t) => t.category === cat.id).length + completedTasks.filter((t) => t.category === cat.id).length;
                const completed = completedTasks.filter((t) => t.category === cat.id).length;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                const distPct = allTotalCount > 0 ? Math.round((total / allTotalCount) * 100) : 0;
                return (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className={cat.textColor}>{cat.label}</span>
                      <span className="text-slate-500 font-extrabold uppercase">{a.distDetail.replace("{completed}", String(completed)).replace("{total}", String(total)).replace("{pct}", String(pct)).replace("{distPct}", String(distPct))}</span>
                    </div>
                    <div className={`w-full h-2.5 rounded-full overflow-hidden relative border border-slate-200/40 ${cat.bgClass}`}>
                      <div className={`h-full opacity-35 ${cat.color} absolute left-0 top-0 transition-all duration-500`} style={{ width: `${distPct}%` }} />
                      <div className={`h-full ${cat.color} absolute left-0 top-0 transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Weekly Summary */}
          <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 flex flex-col shadow-sm ">
            <div className="pb-3.5 border-b border-[#EFEBE4] mb-4">
              <h3 className="text-xs font-bold text-[#2D323A] flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-[#7C5D9E]" />
                <span>{a.aiWeekly}</span>
              </h3>
            </div>
            <div className="flex flex-col items-center gap-3">
              {aiSummary ? (
                <p className="text-[11px] font-medium text-slate-700 leading-relaxed text-center">{aiSummary}</p>
              ) : aiError ? (
                <p className="text-[11px] font-medium text-[#A34E36]">{aiError}</p>
              ) : (
                <p className="text-[10px] text-slate-400 font-semibold">{a.aiWeeklyEmpty}</p>
              )}
              <button
                onClick={generateWeeklySummary}
                disabled={aiLoading}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#C4D7B2] to-[#B2C8DF] text-white text-[10px] font-extrabold tracking-wider hover:shadow-xs transition-all duration-200 disabled:opacity-40 cursor-pointer"
              >
                {aiLoading ? a.aiWeeklyGenerating : a.aiWeeklyGenerate}
              </button>
            </div>
          </div>
        </div>

        {/* Tag-based focus stats */}
        <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 flex flex-col shadow-sm ">
          <div className="pb-3.5 border-b border-[#EFEBE4] mb-4">
            <h3 className="text-xs font-bold text-[#2D323A] flex items-center gap-1.5">
              <Tags className="w-4 h-4 text-[#C97D3E]" />
              <span>{a.tagDist}</span>
            </h3>
          </div>
          <div className="space-y-4 flex-grow">
            {tagStats.length > 0 ? (
              tagStats.slice(0, 8).map((stat) => {
                const pct = Math.round((stat.totalDuration / maxTagDuration) * 100);
                return (
                  <div key={stat.tag} className="flex items-center gap-2">
                    <div className="flex-shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-extrabold text-slate-600 border border-slate-200/40 max-w-[60px] truncate">
                      #{stat.tag}
                    </div>
                    <div className="flex-grow h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                      <div className="h-full bg-gradient-to-r from-[#E8A0BF] to-[#C97D3E] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[8px] font-extrabold text-slate-500 shrink-0">{a.tagItem.replace("{count}", String(stat.count)).replace("{duration}", String(stat.totalDuration))}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs font-semibold">{a.noTags}</div>
            )}
          </div>
        </div>
      </div>

      {/* Task focus ranking */}
      <div className="grid grid-cols-1 gap-5">
        <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-5 flex flex-col shadow-sm ">
          <div className="pb-3.5 border-b border-[#EFEBE4] mb-4">
            <h3 className="text-xs font-bold text-[#2D323A] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#A34E36]" />
              <span>{a.taskBreakdown}</span>
            </h3>
          </div>
          <div className="space-y-4">
            {taskStatsList.length > 0 ? (
              taskStatsList.slice(0, 8).map((stat) => {
                const pct = Math.round((stat.totalDuration / maxDuration) * 100);
                return (
                  <div key={stat.taskId} className="flex items-center gap-2">
                    <div className="flex-grow min-w-0">
                      <p className="text-[10px] font-bold text-slate-700 truncate" title={stat.taskTitle}>{stat.taskTitle}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-grow h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                          <div className="h-full bg-gradient-to-r from-[#B2C8DF] to-[#C4D7B2] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[8px] font-extrabold text-slate-500 shrink-0">{a.taskBreakdownItem.replace("{count}", String(stat.tomatoCount)).replace("{duration}", String(stat.totalDuration))}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs font-semibold">{a.noData}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
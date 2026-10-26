import type { Task } from "../types";

export interface EnergyZone {
  id: "peak" | "break" | "trough" | "rebound" | "evening";
  name: string;
  timeRange: string;
  startHour: number;
  endHour: number;
  recommendedLevel: "high" | "medium" | "low";
  description: string;
  colorClass: string;
  bgLightClass: string;
}

export const ENERGY_ZONES: EnergyZone[] = [
  {
    id: "peak",
    name: "晨间清醒峰值 (Peak)",
    timeRange: "08:30 - 11:30",
    startHour: 8.5,
    endHour: 11.5,
    recommendedLevel: "high",
    description: "意志力与分析力最高，适合攻坚第 I / II 象限核心难关",
    colorClass: "text-rose-600 dark:text-rose-400",
    bgLightClass: "bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40",
  },
  {
    id: "break",
    name: "午间充电小憩",
    timeRange: "11:30 - 13:00",
    startHour: 11.5,
    endHour: 13.0,
    recommendedLevel: "low",
    description: "进餐与闭目养神，暂缓高负荷认知任务",
    colorClass: "text-amber-600 dark:text-amber-400",
    bgLightClass: "bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40",
  },
  {
    id: "trough",
    name: "午后精力低谷 (Trough)",
    timeRange: "13:00 - 15:30",
    startHour: 13.0,
    endHour: 15.5,
    recommendedLevel: "low",
    description: "代谢减缓容易犯困，适合收发邮件、整理便签与事务性沟通",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgLightClass:
      "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40",
  },
  {
    id: "rebound",
    name: "傍晚回潮期 (Rebound)",
    timeRange: "15:30 - 18:00",
    startHour: 15.5,
    endHour: 18.0,
    recommendedLevel: "medium",
    description: "创造力与发散思维回升，适合方案推演、手帐日记与复盘",
    colorClass: "text-indigo-600 dark:text-indigo-400",
    bgLightClass:
      "bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40",
  },
  {
    id: "evening",
    name: "日落晚间离线 (Evening)",
    timeRange: "18:00 - 23:00",
    startHour: 18.0,
    endHour: 23.0,
    recommendedLevel: "low",
    description: "合上手帐，生活充电，告别屏幕与被动待办",
    colorClass: "text-purple-600 dark:text-purple-400",
    bgLightClass:
      "bg-purple-50/70 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900/40",
  },
];

/** 获取当前小时所属的精力潮汐区间 */
export function getCurrentEnergyZone(date: Date = new Date()): EnergyZone {
  const currentHour = date.getHours() + date.getMinutes() / 60;
  for (const zone of ENERGY_ZONES) {
    if (currentHour >= zone.startHour && currentHour < zone.endHour) {
      return zone;
    }
  }
  return ENERGY_ZONES[ENERGY_ZONES.length - 1];
}

/** 智能推断任务的精力消耗属性 */
export function inferTaskEnergyLevel(task: Task): "high" | "medium" | "low" {
  if (task.energyLevel) return task.energyLevel;
  if (task.category === "urgent-important") return "high";
  if (task.category === "important-not-urgent") return "medium";
  return "low";
}

/** 将任务列表按照精力潮汐分区推荐分组 */
export function groupTasksByEnergyZones(tasks: Task[]): Record<string, Task[]> {
  const result: Record<string, Task[]> = {
    peak: [],
    trough: [],
    rebound: [],
    unassigned: [],
  };

  tasks.forEach((task) => {
    const level = inferTaskEnergyLevel(task);
    if (level === "high") {
      result.peak.push(task);
    } else if (level === "low") {
      result.trough.push(task);
    } else {
      result.rebound.push(task);
    }
  });

  return result;
}

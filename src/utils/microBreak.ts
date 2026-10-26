export const MICRO_BREAK_MIN_GAP_SEC = 180;
export const MICRO_BREAK_MAX_GAP_SEC = 420;
export const MICRO_BREAK_TAIL_SEC = 30;

export type MicroBreakCategory = "water" | "look-away" | "stretch" | "breathe" | "eyes";

export interface MicroBreakContent {
  id: MicroBreakCategory;
  title: string;
  actionText: string;
  description: string;
  tip: string;
  emoji: string;
  badgeFrom: string;
  badgeTo: string;
  borderColor: string;
  iconColor: string;
  tapeColor: string;
}

export const MICRO_BREAK_THEMES: MicroBreakContent[] = [
  {
    id: "water",
    title: "微休息 · 喝口温水",
    actionText: "端起水杯，慢慢喝两口温水",
    description: "大脑运转消耗身体能量与水分，给身体补充一杯温水，滋润咽喉，清醒脑海。",
    tip: "充足补水可改善疲乏感与咽喉干痒，让接下来的思考更敏锐。",
    emoji: "🍵",
    badgeFrom: "from-sky-50 to-blue-100 dark:from-[#172330] dark:to-[#101924]",
    badgeTo: "dark:from-[#172330] dark:to-[#101924]",
    borderColor: "border-sky-400/40 dark:border-sky-500/35",
    iconColor: "text-sky-600 dark:text-sky-400",
    tapeColor: "bg-sky-500/20 dark:bg-sky-500/30 border-sky-500/35",
  },
  {
    id: "look-away",
    title: "微休息 · 眺望远方",
    actionText: "视线移向窗外 6 米远方或绿植",
    description: "凝视远处的树梢、天空或窗外风景，让紧绷的睫状肌从近距离对焦中彻底松弛。",
    tip: "20-20-20 护眼法则：每专注 20 分钟，眺望 20 英尺（6米）远景 20 秒。",
    emoji: "🌿",
    badgeFrom: "from-[#EBF5EE] to-[#DCEDE1] dark:from-[#212E24] dark:to-[#17221A]",
    badgeTo: "dark:from-[#212E24] dark:to-[#17221A]",
    borderColor: "border-[#4D7C5D]/35 dark:border-[#4D7C5D]/40",
    iconColor: "text-[#4D7C5D] dark:text-[#78A887]",
    tapeColor: "bg-[#4D7C5D]/20 dark:bg-[#4D7C5D]/30 border-[#4D7C5D]/30",
  },
  {
    id: "stretch",
    title: "微休息 · 舒展肩颈",
    actionText: "十指交叉向上推举，转动肩颈",
    description: "双手托天拉伸脊椎，缓缓左右转动颈项，释放斜方肌与腰背积攒的久坐紧绷感。",
    tip: "只需 5 秒简单伸展，即可促进血液循环，赶走伏案疲劳与肩部僵硬。",
    emoji: "🧘",
    badgeFrom: "from-amber-50 to-orange-100 dark:from-[#2C2117] dark:to-[#201811]",
    badgeTo: "dark:from-[#2C2117] dark:to-[#201811]",
    borderColor: "border-amber-500/35 dark:border-amber-500/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    tapeColor: "bg-amber-500/20 dark:bg-amber-500/30 border-amber-500/30",
  },
  {
    id: "breathe",
    title: "微休息 · 深呼吸调息",
    actionText: "闭目缓慢深吸气，徐徐吐气",
    description:
      "用鼻子慢吸 3 秒让新鲜空气充满肺腑与腹腔，再微启双唇缓慢吐出，排解胸口浊气与焦虑。",
    tip: "深长缓和的呼吸能快速激活副交感神经，平抑心率，抚平杂念与焦躁。",
    emoji: "🌬️",
    badgeFrom: "from-teal-50 to-emerald-100 dark:from-[#172625] dark:to-[#111D1C]",
    badgeTo: "dark:from-[#172625] dark:to-[#111D1C]",
    borderColor: "border-teal-500/35 dark:border-teal-500/30",
    iconColor: "text-teal-600 dark:text-teal-400",
    tapeColor: "bg-teal-500/20 dark:bg-teal-500/30 border-teal-500/30",
  },
  {
    id: "eyes",
    title: "微休息 · 闭目润眼",
    actionText: "轻柔闭目，双手搓温轻抚眼眶",
    description: "手掌搓热轻敷在眼周，在黑暗中让眼球平缓放松，刺激泪液均匀分布，润养干涩角膜。",
    tip: "面对屏幕时眨眼频次下降超 60%，闭目 5 秒即可给眼睛带来天然水疗。",
    emoji: "👁️",
    badgeFrom: "from-indigo-50 to-purple-100 dark:from-[#1E1D2D] dark:to-[#161522]",
    badgeTo: "dark:from-[#1E1D2D] dark:to-[#161522]",
    borderColor: "border-indigo-400/35 dark:border-indigo-500/30",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    tapeColor: "bg-indigo-500/20 dark:bg-indigo-500/30 border-indigo-500/30",
  },
];

export function getRandomMicroBreakTheme(excludeId?: MicroBreakCategory): MicroBreakContent {
  const pool = excludeId
    ? MICRO_BREAK_THEMES.filter((t) => t.id !== excludeId)
    : MICRO_BREAK_THEMES;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function getIntervalGaps(intervalKey: string = "3-5"): { minSec: number; maxSec: number } {
  switch (intervalKey) {
    case "test-30s":
      return { minSec: 15, maxSec: 30 };
    case "1-2":
      return { minSec: 60, maxSec: 120 };
    case "5-10":
      return { minSec: 300, maxSec: 600 };
    case "3-5":
    default:
      return { minSec: 180, maxSec: 300 };
  }
}

/**
 * Remaining-seconds threshold at which a micro-break should fire.
 * Long sessions keep the gap. Shorter sessions still schedule inside the usable window.
 * Returns null when there is no time left before the tail guard.
 */
export function scheduleMicroBreakThreshold(
  remainingSec: number,
  rng: () => number = Math.random,
  minGap: number = MICRO_BREAK_MIN_GAP_SEC,
  maxGap: number = MICRO_BREAK_MAX_GAP_SEC,
  tailSec: number = MICRO_BREAK_TAIL_SEC,
): number | null {
  if (!(remainingSec > tailSec)) return null;
  const maxDelay = Math.min(maxGap, remainingSec - tailSec);
  const minDelay = Math.min(minGap, maxDelay);
  const delay = minDelay + rng() * (maxDelay - minDelay);
  const threshold = remainingSec - delay;
  if (!(threshold > 0)) return null;
  return threshold;
}

/** Next threshold after one break. `-1` means "not again before this session's tail". */
export function nextThresholdAfterMicroBreak(
  remainingSec: number,
  rng: () => number = Math.random,
  minGap: number = MICRO_BREAK_MIN_GAP_SEC,
  maxGap: number = MICRO_BREAK_MAX_GAP_SEC,
  tailSec: number = MICRO_BREAK_TAIL_SEC,
): number {
  const gap = minGap + rng() * (maxGap - minGap);
  const threshold = remainingSec - gap;
  if (threshold < tailSec) return -1;
  return threshold;
}

export interface MicroBreakScheduleInput {
  enabled: boolean;
  isFocus: boolean;
  remainingSec: number;
  endTime: number | null;
  previous: number | null;
  suppressedForEndTime: number | null;
  enabledJustTurnedOn: boolean;
  rng?: () => number;
  minGapSec?: number;
  maxGapSec?: number;
  tailSec?: number;
}

export interface MicroBreakSchedule {
  next: number | null;
  suppressedForEndTime: number | null;
}

/**
 * Schedule a break when the toggle turns on mid-session, and treat a leftover `-1`
 * as stale unless it was just chosen for this same end time.
 */
export function resolveMicroBreakSchedule(input: MicroBreakScheduleInput): MicroBreakSchedule {
  const rng = input.rng ?? Math.random;
  const minGap = input.minGapSec ?? MICRO_BREAK_MIN_GAP_SEC;
  const maxGap = input.maxGapSec ?? MICRO_BREAK_MAX_GAP_SEC;
  const tailSec = input.tailSec ?? MICRO_BREAK_TAIL_SEC;
  let previous = input.previous;
  let suppressed = input.suppressedForEndTime;

  if (input.enabledJustTurnedOn && previous !== null && previous < 0) {
    previous = null;
    suppressed = null;
  }
  if (previous !== null && previous < 0 && suppressed !== input.endTime) {
    previous = null;
    suppressed = null;
  }

  if (!input.enabled || !input.isFocus) {
    if (previous !== null && previous < 0) {
      return { next: null, suppressedForEndTime: null };
    }
    return { next: previous, suppressedForEndTime: suppressed };
  }

  if (previous !== null && previous < 0 && suppressed === input.endTime) {
    return { next: -1, suppressedForEndTime: suppressed };
  }

  if (previous === null || previous < 0) {
    const scheduled = scheduleMicroBreakThreshold(input.remainingSec, rng, minGap, maxGap, tailSec);
    return {
      next: scheduled,
      suppressedForEndTime: scheduled === null ? input.endTime : null,
    };
  }
  return { next: previous, suppressedForEndTime: suppressed };
}

export function shouldFireMicroBreak(
  remainingSec: number,
  threshold: number | null,
  alreadyOnBreak: boolean,
): boolean {
  if (alreadyOnBreak) return false;
  if (threshold === null || threshold < 0) return false;
  return remainingSec > 0 && remainingSec <= threshold;
}

type NotificationCtor = {
  permission: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
  new (title: string, options?: { body?: string }): unknown;
};

/** System notification plus an in-app toast. The toast is shown even if notification permission is denied. */
export function announceMicroBreak(
  notice: { title: string; body: string },
  options: {
    onToast?: (text: string) => void;
    NotificationAPI?: NotificationCtor;
  } = {},
): void {
  options.onToast?.(notice.body);
  const API =
    options.NotificationAPI ??
    (typeof globalThis.Notification === "function"
      ? (globalThis.Notification as unknown as NotificationCtor)
      : undefined);
  if (!API) return;
  const show = () => {
    new API(notice.title, { body: notice.body });
  };
  if (API.permission === "granted") {
    show();
    return;
  }
  if (API.permission === "default" && typeof API.requestPermission === "function") {
    void API.requestPermission().then((result) => {
      if (result === "granted") show();
    });
  }
}

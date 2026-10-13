export const MICRO_BREAK_MIN_GAP_SEC = 180;
export const MICRO_BREAK_MAX_GAP_SEC = 420;
export const MICRO_BREAK_TAIL_SEC = 30;

/**
 * Remaining-seconds threshold at which a micro-break should fire.
 * Long sessions keep the 3–7 minute gap. Shorter sessions still schedule inside the usable window.
 * Returns null when there is no time left before the tail guard.
 */
export function scheduleMicroBreakThreshold(
  remainingSec: number,
  rng: () => number = Math.random,
): number | null {
  if (!(remainingSec > MICRO_BREAK_TAIL_SEC)) return null;
  const maxDelay = Math.min(MICRO_BREAK_MAX_GAP_SEC, remainingSec - MICRO_BREAK_TAIL_SEC);
  const minDelay = Math.min(MICRO_BREAK_MIN_GAP_SEC, maxDelay);
  const delay = minDelay + rng() * (maxDelay - minDelay);
  const threshold = remainingSec - delay;
  if (!(threshold > 0)) return null;
  return threshold;
}

/** Next threshold after one break. `-1` means "not again before this session's tail". */
export function nextThresholdAfterMicroBreak(
  remainingSec: number,
  rng: () => number = Math.random,
): number {
  const gap = MICRO_BREAK_MIN_GAP_SEC + rng() * (MICRO_BREAK_MAX_GAP_SEC - MICRO_BREAK_MIN_GAP_SEC);
  const threshold = remainingSec - gap;
  if (threshold < MICRO_BREAK_TAIL_SEC) return -1;
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
    const scheduled = scheduleMicroBreakThreshold(input.remainingSec, rng);
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

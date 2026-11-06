import { useState, useCallback, useRef } from "react";
import type { AlertSoundType, PomodoroLog } from "../types";
import { useSync } from "./useSync";
import { audioEngine } from "../utils/audioEngine";
import {
  nextNoiseStartSignal,
  resolveAutoNoiseTarget,
  shouldEmitExternalPlaySignal,
} from "../utils/noisePolicy";
import {
  loadCustomNoiseActiveId,
  loadCustomNoiseLinks,
  loadNoiseSource,
  saveCustomNoiseActiveId,
  saveNoiseSource,
  type NoiseSourceType,
} from "../utils/customNoise";
import { safeJsonParse } from "../utils/json";
import {
  MICRO_BREAK_MAX_DURATION_SEC,
  MICRO_BREAK_MAX_GAP_SEC,
  MICRO_BREAK_MIN_DURATION_SEC,
  MICRO_BREAK_MIN_GAP_SEC,
  resolveMicroBreakDuration,
  resolveMicroBreakGaps,
} from "../utils/microBreak";

export const MICRO_BREAK_STORAGE_KEYS = {
  gapMinSec: "tongyun_micro_break_gap_min_sec",
  gapMaxSec: "tongyun_micro_break_gap_max_sec",
  durationMinSec: "tongyun_micro_break_duration_min_sec",
  durationMaxSec: "tongyun_micro_break_duration_max_sec",
  legacyInterval: "tongyun_random_break_interval",
} as const;

function readStoredSeconds(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function usePomodoro() {
  const { syncState } = useSync();

  const [pomodoroLogs, setPomodoroLogs] = useState<PomodoroLog[]>(() => {
    if (typeof localStorage === "undefined") return [];
    return safeJsonParse<PomodoroLog[]>(localStorage.getItem("aero_pomodoro_logs") || "[]", []);
  });
  const [focusDuration, setFocusDuration] = useState<number>(25);
  const [breakDuration, setBreakDuration] = useState<number>(5);
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState<number>(25 * 60);
  const [pomodoroEndTime, setPomodoroEndTime] = useState<number | null>(null);
  const [pomodoroIsActive, setPomodoroIsActive] = useState<boolean>(false);
  const [pomodoroIsBreak, setPomodoroIsBreak] = useState<boolean>(false);
  const [pomodoroSessionCount, setPomodoroSessionCount] = useState<number>(0);
  const [alertSoundType, setAlertSoundType] = useState<AlertSoundType>("beep");
  const [randomBreakEnabled, setRandomBreakEnabled] = useState<boolean>(() => {
    return localStorage.getItem("tongyun_random_break") === "true";
  });
  const [microBreakGapMinSec, setMicroBreakGapMinSec] = useState<number>(() =>
    readStoredSeconds(MICRO_BREAK_STORAGE_KEYS.gapMinSec, MICRO_BREAK_MIN_GAP_SEC),
  );
  const [microBreakGapMaxSec, setMicroBreakGapMaxSec] = useState<number>(() =>
    readStoredSeconds(MICRO_BREAK_STORAGE_KEYS.gapMaxSec, MICRO_BREAK_MAX_GAP_SEC),
  );
  const [microBreakDurationMinSec, setMicroBreakDurationMinSec] = useState<number>(() =>
    readStoredSeconds(MICRO_BREAK_STORAGE_KEYS.durationMinSec, MICRO_BREAK_MIN_DURATION_SEC),
  );
  const [microBreakDurationMaxSec, setMicroBreakDurationMaxSec] = useState<number>(() =>
    readStoredSeconds(MICRO_BREAK_STORAGE_KEYS.durationMaxSec, MICRO_BREAK_MAX_DURATION_SEC),
  );

  /** 统一收敛间隔范围并落盘，保证 min ≤ max、数值在允许区间内。 */
  const setMicroBreakGap = useCallback((minSec: number, maxSec: number) => {
    const range = resolveMicroBreakGaps(minSec, maxSec);
    setMicroBreakGapMinSec(range.minSec);
    setMicroBreakGapMaxSec(range.maxSec);
    localStorage.setItem(MICRO_BREAK_STORAGE_KEYS.gapMinSec, String(range.minSec));
    localStorage.setItem(MICRO_BREAK_STORAGE_KEYS.gapMaxSec, String(range.maxSec));
  }, []);

  /** 每次休息时长同样在范围内随机取值。 */
  const setMicroBreakDuration = useCallback((minSec: number, maxSec: number) => {
    const range = resolveMicroBreakDuration(minSec, maxSec);
    setMicroBreakDurationMinSec(range.minSec);
    setMicroBreakDurationMaxSec(range.maxSec);
    localStorage.setItem(MICRO_BREAK_STORAGE_KEYS.durationMinSec, String(range.minSec));
    localStorage.setItem(MICRO_BREAK_STORAGE_KEYS.durationMaxSec, String(range.maxSec));
  }, []);
  const [autoNoiseEnabled, setAutoNoiseEnabled] = useState<boolean>(() => {
    return localStorage.getItem("tongyun_auto_noise") === "true";
  });
  const [pomodoroTaskId, setPomodoroTaskId] = useState<string | null>(null);
  const [pomodoroTaskTitle, setPomodoroTaskTitle] = useState<string | null>(null);

  // Offline noise state
  const [isPlayingNoise, setIsPlayingNoise] = useState<boolean>(false);
  /** 内置白噪音每次启动自增，外部音源监听它来互斥，因此不依赖具体启动入口。 */
  const [noiseStartSignal, setNoiseStartSignal] = useState<number>(0);
  const [wasPlayingNoise, setWasPlayingNoise] = useState<boolean>(false);
  if (wasPlayingNoise !== isPlayingNoise) {
    setNoiseStartSignal(
      nextNoiseStartSignal({
        wasPlaying: wasPlayingNoise,
        isPlaying: isPlayingNoise,
        signal: noiseStartSignal,
      }),
    );
    setWasPlayingNoise(isPlayingNoise);
  }
  const [selectedNoiseType, setSelectedNoiseType] = useState<string>("brown");
  const [noiseVolume, setNoiseVolume] = useState<number>(0.35);
  const [noiseSource, setNoiseSourceState] = useState<NoiseSourceType>(() => loadNoiseSource());
  const [activeCustomNoiseId, setActiveCustomNoiseIdState] = useState<string | null>(() =>
    loadCustomNoiseActiveId(),
  );
  const [isPlayingExternalNoise, setIsPlayingExternalNoise] = useState<boolean>(false);
  const [externalPlaySignal, setExternalPlaySignal] = useState<number>(0);
  const [externalStopSignal, setExternalStopSignal] = useState<number>(0);

  const setNoiseSource = useCallback((source: NoiseSourceType) => {
    setNoiseSourceState(source);
    saveNoiseSource(source);
  }, []);

  const setActiveCustomNoiseId = useCallback((id: string | null) => {
    setActiveCustomNoiseIdState(id);
    saveCustomNoiseActiveId(id);
  }, []);

  /** Manual mute wins over auto-noise and micro-break resume until the user presses play. */
  const noiseManuallyStoppedRef = useRef(false);

  const syncPomodoro = useCallback(
    (
      active: boolean,
      timeLeft: number,
      isBreak: boolean,
      fDur: number,
      bDur: number,
      session: number,
      tId?: string | null,
      tTitle?: string | null,
    ) => {
      const finalTaskId = tId !== undefined ? tId : pomodoroTaskId;
      const finalTaskTitle = tTitle !== undefined ? tTitle : pomodoroTaskTitle;
      const endTime = active ? Date.now() + timeLeft * 1000 : null;
      setPomodoroEndTime(endTime);
      const data = JSON.stringify({
        active,
        timeLeft,
        endTime,
        isBreak,
        focusDuration: fDur,
        breakDuration: bDur,
        sessionCount: session,
        taskId: finalTaskId,
        taskTitle: finalTaskTitle,
      });
      syncState("pomodoro", "pomodoro_sync", data);
    },
    [pomodoroTaskId, pomodoroTaskTitle, syncState],
  );

  const addPomodoroLog = useCallback(
    (log: PomodoroLog) => {
      setPomodoroLogs((prev) => {
        const next = [log, ...prev.filter((l) => l.id !== log.id)];
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem("aero_pomodoro_logs", JSON.stringify(next));
          } catch {
            /* ignore localStorage quota/parse error */
          }
        }
        return next;
      });
      void syncState(log.id, "add_pomodoro_log", JSON.stringify(log));
    },
    [syncState],
  );

  const handleStartFocus = useCallback(
    (taskId: string, taskTitle: string) => {
      setPomodoroTaskId(taskId);
      setPomodoroTaskTitle(taskTitle);
      setPomodoroIsActive(true);
      setPomodoroIsBreak(false);
      const nextTime = focusDuration * 60;
      setPomodoroTimeLeft(nextTime);
      const endTime = Date.now() + nextTime * 1000;
      setPomodoroEndTime(endTime);
      syncPomodoro(
        true,
        nextTime,
        false,
        focusDuration,
        breakDuration,
        pomodoroSessionCount,
        taskId,
        taskTitle,
      );
      // 在用户手势上下文中预热并激活 AudioContext，确保后续微休息在无手势定时器下 100% 能够发声
      void audioEngine.ensureAudioContext();

      const target = resolveAutoNoiseTarget({
        autoNoiseEnabled,
        active: true,
        isBreak: false,
        manuallyStopped: noiseManuallyStoppedRef.current,
        noiseSource,
        hasCustomNoiseLink: Boolean(loadCustomNoiseLinks().length),
      });
      if (target === "external") {
        audioEngine.stopNoise();
        setIsPlayingNoise(false);
        setIsPlayingExternalNoise(true);
        setExternalPlaySignal((s) => s + 1);
      } else if (target === "internal") {
        setIsPlayingExternalNoise(false);
        setExternalStopSignal((s) => s + 1);
        audioEngine.startNoise(selectedNoiseType, noiseVolume);
        setIsPlayingNoise(true);
      }
    },
    [
      focusDuration,
      breakDuration,
      pomodoroSessionCount,
      syncPomodoro,
      autoNoiseEnabled,
      selectedNoiseType,
      noiseVolume,
      noiseSource,
    ],
  );

  const playCompletionSound = useCallback(() => {
    const soundType = localStorage.getItem("aero_alert_sound_type") || alertSoundType;
    audioEngine.playCompletionSound(soundType);
  }, [alertSoundType]);

  const startNoise = useCallback((type: string, volume: number) => {
    noiseManuallyStoppedRef.current = false;
    setNoiseSourceState("internal");
    saveNoiseSource("internal");
    setIsPlayingExternalNoise(false);
    setExternalStopSignal((s) => s + 1);
    audioEngine.startNoise(type, volume);
    setIsPlayingNoise(true);
  }, []);

  const startExternalNoise = useCallback(
    (id?: string, options?: { echo?: boolean }) => {
      noiseManuallyStoppedRef.current = false;
      setNoiseSourceState("external");
      saveNoiseSource("external");
      if (id) {
        setActiveCustomNoiseIdState(id);
        saveCustomNoiseActiveId(id);
      }
      audioEngine.stopNoise();
      setIsPlayingNoise(false);
      setIsPlayingExternalNoise(true);
      if (
        shouldEmitExternalPlaySignal({
          echo: options?.echo !== false,
          alreadyPlayingExternal: isPlayingExternalNoise,
        })
      ) {
        setExternalPlaySignal((s) => s + 1);
      }
    },
    [isPlayingExternalNoise],
  );

  const stopNoise = useCallback((reason: "manual" | "auto" = "manual") => {
    if (reason === "manual") noiseManuallyStoppedRef.current = true;
    audioEngine.stopNoise();
    setIsPlayingNoise(false);
    setIsPlayingExternalNoise(false);
    setExternalStopSignal((s) => s + 1);
  }, []);

  const isNoiseManuallyStopped = useCallback(() => noiseManuallyStoppedRef.current, []);

  /** Apply auto-noise policy: play only during active focus (not break), unless the user muted. */
  const applyAutoNoise = useCallback(
    (active: boolean, isBreak: boolean) => {
      // 核心修复：当专注处于暂停、停止或休息时，不论 autoNoiseEnabled 是否开启，只要正在播放都必须停掉！
      if (!active || isBreak) {
        if (isPlayingNoise || isPlayingExternalNoise || autoNoiseEnabled) {
          audioEngine.stopNoise();
          setIsPlayingNoise(false);
          setIsPlayingExternalNoise(false);
          setExternalStopSignal((s) => s + 1);
        }
        return;
      }
      const target = resolveAutoNoiseTarget({
        autoNoiseEnabled,
        active,
        isBreak,
        manuallyStopped: noiseManuallyStoppedRef.current,
        noiseSource,
        hasCustomNoiseLink: Boolean(loadCustomNoiseLinks().length),
      });
      if (target === "external") {
        audioEngine.stopNoise();
        setIsPlayingNoise(false);
        if (
          shouldEmitExternalPlaySignal({
            echo: true,
            alreadyPlayingExternal: isPlayingExternalNoise,
          })
        ) {
          setIsPlayingExternalNoise(true);
          setExternalPlaySignal((s) => s + 1);
        }
        return;
      }
      if (target === "internal") {
        setIsPlayingExternalNoise(false);
        setExternalStopSignal((s) => s + 1);
        audioEngine.startNoise(selectedNoiseType, noiseVolume);
        setIsPlayingNoise(true);
        return;
      }
      audioEngine.stopNoise();
      setIsPlayingNoise(false);
      setIsPlayingExternalNoise(false);
      setExternalStopSignal((s) => s + 1);
    },
    [
      autoNoiseEnabled,
      selectedNoiseType,
      noiseVolume,
      isPlayingNoise,
      isPlayingExternalNoise,
      noiseSource,
    ],
  );

  return {
    pomodoroLogs,
    setPomodoroLogs,
    focusDuration,
    setFocusDuration,
    breakDuration,
    setBreakDuration,
    pomodoroTimeLeft,
    setPomodoroTimeLeft,
    pomodoroEndTime,
    setPomodoroEndTime,
    pomodoroIsActive,
    setPomodoroIsActive,
    pomodoroIsBreak,
    setPomodoroIsBreak,
    pomodoroSessionCount,
    setPomodoroSessionCount,
    alertSoundType,
    setAlertSoundType,
    randomBreakEnabled,
    setRandomBreakEnabled,
    microBreakGapMinSec,
    microBreakGapMaxSec,
    microBreakDurationMinSec,
    microBreakDurationMaxSec,
    setMicroBreakGap,
    setMicroBreakDuration,
    autoNoiseEnabled,
    setAutoNoiseEnabled,
    pomodoroTaskId,
    setPomodoroTaskId,
    pomodoroTaskTitle,
    setPomodoroTaskTitle,
    isPlayingNoise,
    setIsPlayingNoise,
    noiseStartSignal,
    selectedNoiseType,
    setSelectedNoiseType,
    noiseVolume,
    setNoiseVolume,
    syncPomodoro,
    addPomodoroLog,
    handleStartFocus,
    playCompletionSound,
    startNoise,
    startExternalNoise,
    stopNoise,
    isNoiseManuallyStopped,
    applyAutoNoise,
    noiseSource,
    setNoiseSource,
    activeCustomNoiseId,
    setActiveCustomNoiseId,
    isPlayingExternalNoise,
    setIsPlayingExternalNoise,
    externalPlaySignal,
    externalStopSignal,
  };
}

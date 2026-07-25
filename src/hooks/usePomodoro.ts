import { useState, useCallback } from "react";
import type { AlertSoundType, PomodoroLog } from "../types";
import { useSync } from "./useSync";
import { audioEngine } from "../utils/audioEngine";

export function usePomodoro() {
  const { syncState } = useSync();

  const [pomodoroLogs, setPomodoroLogs] = useState<PomodoroLog[]>([]);
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
  const [autoNoiseEnabled, setAutoNoiseEnabled] = useState<boolean>(() => {
    return localStorage.getItem("tongyun_auto_noise") === "true";
  });
  const [pomodoroTaskId, setPomodoroTaskId] = useState<string | null>(null);
  const [pomodoroTaskTitle, setPomodoroTaskTitle] = useState<string | null>(null);

  // Offline noise state
  const [isPlayingNoise, setIsPlayingNoise] = useState<boolean>(false);
  const [selectedNoiseType, setSelectedNoiseType] = useState<string>("brown");
  const [noiseVolume, setNoiseVolume] = useState<number>(0.35);

  const syncPomodoro = useCallback((
    active: boolean,
    timeLeft: number,
    isBreak: boolean,
    fDur: number,
    bDur: number,
    session: number,
    tId?: string | null,
    tTitle?: string | null
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
  }, [pomodoroTaskId, pomodoroTaskTitle, syncState]);

  const handleStartFocus = useCallback((taskId: string, taskTitle: string) => {
    setPomodoroTaskId(taskId);
    setPomodoroTaskTitle(taskTitle);
    setPomodoroIsActive(true);
    setPomodoroIsBreak(false);
    const nextTime = focusDuration * 60;
    setPomodoroTimeLeft(nextTime);
    const endTime = Date.now() + nextTime * 1000;
    setPomodoroEndTime(endTime);
    syncPomodoro(true, nextTime, false, focusDuration, breakDuration, pomodoroSessionCount, taskId, taskTitle);
    if (autoNoiseEnabled) {
      audioEngine.startNoise(selectedNoiseType, noiseVolume);
      setIsPlayingNoise(true);
    }
  }, [focusDuration, breakDuration, pomodoroSessionCount, syncPomodoro, autoNoiseEnabled, selectedNoiseType, noiseVolume]);

  const playCompletionSound = useCallback(() => {
    const soundType = localStorage.getItem("aero_alert_sound_type") || alertSoundType;
    audioEngine.playCompletionSound(soundType);
  }, [alertSoundType]);

  const startNoise = useCallback((type: string, volume: number) => {
    audioEngine.startNoise(type, volume);
    setIsPlayingNoise(true);
  }, []);

  const stopNoise = useCallback(() => {
    audioEngine.stopNoise();
    setIsPlayingNoise(false);
  }, []);

  /** Apply auto-noise policy: play only during active focus (not break). */
  const applyAutoNoise = useCallback((active: boolean, isBreak: boolean) => {
    if (!autoNoiseEnabled) return;
    if (active && !isBreak) {
      audioEngine.startNoise(selectedNoiseType, noiseVolume);
      setIsPlayingNoise(true);
    } else {
      audioEngine.stopNoise();
      setIsPlayingNoise(false);
    }
  }, [autoNoiseEnabled, selectedNoiseType, noiseVolume]);

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
    autoNoiseEnabled,
    setAutoNoiseEnabled,
    pomodoroTaskId,
    setPomodoroTaskId,
    pomodoroTaskTitle,
    setPomodoroTaskTitle,
    isPlayingNoise,
    setIsPlayingNoise,
    selectedNoiseType,
    setSelectedNoiseType,
    noiseVolume,
    setNoiseVolume,
    syncPomodoro,
    handleStartFocus,
    playCompletionSound,
    startNoise,
    stopNoise,
    applyAutoNoise,
  };
}

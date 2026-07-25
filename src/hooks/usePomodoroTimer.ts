import { useEffect, useRef } from "react";
import type { usePomodoro } from "./usePomodoro";
import type { useTranslation } from "../i18n/LanguageContext";
import { audioEngine } from "../utils/audioEngine";
import { createId } from "../utils/id";

interface UsePomodoroTimerOptions {
  pomodoroHook: ReturnType<typeof usePomodoro>;
  locale: string;
  windowLabel: string;
  t: ReturnType<typeof useTranslation>["t"];
  onCelebration: (msg: string) => void;
}

export function usePomodoroTimer({
  pomodoroHook,
  locale,
  windowLabel,
  t,
  onCelebration,
}: UsePomodoroTimerOptions) {
  const windowLabelRef = useRef(windowLabel);
  useEffect(() => { windowLabelRef.current = windowLabel; }, [windowLabel]);

  const pomodoroStateRef = useRef({
    isBreak: pomodoroHook.pomodoroIsBreak,
    focusDuration: pomodoroHook.focusDuration,
    breakDuration: pomodoroHook.breakDuration,
    sessionCount: pomodoroHook.pomodoroSessionCount,
    taskId: pomodoroHook.pomodoroTaskId,
    taskTitle: pomodoroHook.pomodoroTaskTitle,
    locale,
    windowLabel,
    syncPomodoro: pomodoroHook.syncPomodoro,
    focusTime: t.notification.focusTime,
    focusTimeBody: t.notification.focusTimeBody,
    pomodoroTime: t.notification.pomodoroTime,
    pomodoroTimeBody: t.notification.pomodoroTimeBody,
    randomBreakEnabled: pomodoroHook.randomBreakEnabled,
    isPlayingNoise: pomodoroHook.isPlayingNoise,
    autoNoiseEnabled: pomodoroHook.autoNoiseEnabled,
    selectedNoiseType: pomodoroHook.selectedNoiseType,
    noiseVolume: pomodoroHook.noiseVolume,
  });

  useEffect(() => {
    pomodoroStateRef.current = {
      isBreak: pomodoroHook.pomodoroIsBreak,
      focusDuration: pomodoroHook.focusDuration,
      breakDuration: pomodoroHook.breakDuration,
      sessionCount: pomodoroHook.pomodoroSessionCount,
      taskId: pomodoroHook.pomodoroTaskId,
      taskTitle: pomodoroHook.pomodoroTaskTitle,
      locale,
      windowLabel,
      syncPomodoro: pomodoroHook.syncPomodoro,
      focusTime: t.notification.focusTime,
      focusTimeBody: t.notification.focusTimeBody,
      pomodoroTime: t.notification.pomodoroTime,
      pomodoroTimeBody: t.notification.pomodoroTimeBody,
      randomBreakEnabled: pomodoroHook.randomBreakEnabled,
      isPlayingNoise: pomodoroHook.isPlayingNoise,
      autoNoiseEnabled: pomodoroHook.autoNoiseEnabled,
      selectedNoiseType: pomodoroHook.selectedNoiseType,
      noiseVolume: pomodoroHook.noiseVolume,
    };
  });

  const nextRandomBreakRef = useRef<number | null>(null);
  const isOnRandomBreakRef = useRef<boolean>(false);

  useEffect(() => {
    if (!pomodoroHook.pomodoroIsActive || !pomodoroHook.pomodoroEndTime) return;
    const endTime = pomodoroHook.pomodoroEndTime;
    let fired = false;

    if (pomodoroHook.randomBreakEnabled && !pomodoroHook.pomodoroIsBreak && nextRandomBreakRef.current === null) {
      const minGap = 180;
      const maxGap = 420;
      const totalSec = pomodoroHook.focusDuration * 60;
      nextRandomBreakRef.current = totalSec - (minGap + Math.random() * (maxGap - minGap));
    }

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.round((endTime - now) / 1000));
      pomodoroHook.setPomodoroTimeLeft(diff);

      const ps = pomodoroStateRef.current;

      if (
        ps.randomBreakEnabled &&
        !ps.isBreak &&
        diff > 0 &&
        nextRandomBreakRef.current !== null &&
        diff <= nextRandomBreakRef.current &&
        !isOnRandomBreakRef.current
      ) {
        isOnRandomBreakRef.current = true;
        clearInterval(intervalId);
        const sounds = ["beep", "cuckoo", "meow", "chime", "ding", "marimba"];
        const randomSound = sounds[Math.floor(Math.random() * sounds.length)];
        audioEngine.playCompletionSound(randomSound);
        const wasPlayingNoise = ps.isPlayingNoise;
        if (wasPlayingNoise) {
          pomodoroHook.stopNoise();
        }
        const minGap = 180;
        const maxGap = 420;
        const nextGap = minGap + Math.random() * (maxGap - minGap);
        nextRandomBreakRef.current = diff - nextGap;
        if (nextRandomBreakRef.current < 30) {
          nextRandomBreakRef.current = -1;
        }
        setTimeout(() => {
          isOnRandomBreakRef.current = false;
          const psNow = pomodoroStateRef.current;
          if (wasPlayingNoise || psNow.autoNoiseEnabled) {
            pomodoroHook.startNoise(psNow.selectedNoiseType, psNow.noiseVolume);
          }
          pomodoroHook.setPomodoroEndTime(endTime + 5000);
        }, 5000);
      }

      if (diff <= 0 && !fired) {
        fired = true;
        clearInterval(intervalId);
        nextRandomBreakRef.current = null;
        isOnRandomBreakRef.current = false;

        const s = pomodoroStateRef.current;
        if (s.windowLabel !== "main") return;

        pomodoroHook.playCompletionSound();
        if (pomodoroHook.autoNoiseEnabled) {
          pomodoroHook.stopNoise();
        }

        if (s.isBreak) {
          pomodoroHook.setPomodoroIsBreak(false);
          pomodoroHook.setPomodoroIsActive(false);
          pomodoroHook.setPomodoroEndTime(null);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(s.focusTime, { body: s.focusTimeBody });
          }
          const nextTime = s.focusDuration * 60;
          pomodoroHook.setPomodoroTimeLeft(nextTime);
          setTimeout(() => {
            s.syncPomodoro(false, nextTime, false, s.focusDuration, s.breakDuration, s.sessionCount, null, null);
          }, 50);
        } else {
          pomodoroHook.setPomodoroIsBreak(true);
          pomodoroHook.setPomodoroIsActive(false);
          pomodoroHook.setPomodoroEndTime(null);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(s.pomodoroTime, { body: s.pomodoroTimeBody });
          }
          const nextSession = s.sessionCount + 1;
          pomodoroHook.setPomodoroSessionCount(nextSession);
          const nextTime = s.breakDuration * 60;
          pomodoroHook.setPomodoroTimeLeft(nextTime);

          const newLog = {
            id: createId("pomodoro-log"),
            timestamp: Date.now(),
            duration: s.focusDuration,
            taskId: s.taskId || undefined,
            taskTitle: s.taskTitle || undefined,
          };
          pomodoroHook.setPomodoroLogs((prev: any[]) => [newLog, ...prev]);

          onCelebration(s.locale === "en" ? "Focus session done! Keep going 💪" : "专注一关完成！继续加油 💪");

          pomodoroHook.setPomodoroTaskId(null);
          pomodoroHook.setPomodoroTaskTitle(null);

          setTimeout(() => {
            s.syncPomodoro(false, nextTime, true, s.focusDuration, s.breakDuration, nextSession, null, null);
          }, 50);
        }
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoroHook.pomodoroIsActive, pomodoroHook.pomodoroEndTime]);
}

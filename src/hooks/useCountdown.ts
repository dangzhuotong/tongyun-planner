import { useState, useCallback, useMemo } from "react";
import type { CountdownEvent } from "../types";
import { createId } from "../utils/id";
import { safeJsonParse } from "../utils/json";

export function useCountdown() {
  // lazy initializer 直接从 localStorage 恢复，避免首次 render 时被空数组覆盖
  const [countdowns, setCountdowns] = useState<CountdownEvent[]>(() =>
    safeJsonParse<CountdownEvent[]>(localStorage.getItem("tongyun_countdowns"), [])
  );

  const handleAddCountdown = useCallback((event: { title: string; targetDate: string; emoji?: string; color?: string }) => {
    const newEvent: CountdownEvent = {
      id: createId("countdown"),
      title: event.title,
      targetDate: event.targetDate,
      emoji: event.emoji || "🎯",
      color: event.color,
    };
    setCountdowns((prev) => [...prev, newEvent]);
  }, []);

  const handleDeleteCountdown = useCallback((id: string) => {
    setCountdowns((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return useMemo(() => ({
    countdowns,
    setCountdowns,
    handleAddCountdown,
    handleDeleteCountdown,
  }), [countdowns, handleAddCountdown, handleDeleteCountdown]);
}

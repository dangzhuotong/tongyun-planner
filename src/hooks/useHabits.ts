import { useState, useEffect, useCallback } from "react";
import type { HabitItem } from "../types";
import { getLocalDateString } from "../utils/date";
import { createId } from "../utils/id";

const STORAGE_KEY = "tongyun_habits";

function load(): HabitItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function save(items: HabitItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * 习惯打卡 hook。
 * 每日自动重置 doneToday，连续天数基于 lastDoneDate 计算。
 */
export function useHabits() {
  const [habits, setHabits] = useState<HabitItem[]>(() => {
    const stored = load();
    const today = getLocalDateString();

    return stored.map((h) => {
      // 不是今天打的卡 → 重置
      if (h.lastDoneDate !== today) {
        return { ...h, doneToday: false };
      }
      return h;
    });
  });

  // 当日持久化
  useEffect(() => {
    save(habits);
  }, [habits]);

  // 跨天自动重置
  useEffect(() => {
    const today = getLocalDateString();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.doneToday && h.lastDoneDate !== today) {
          return { ...h, doneToday: false };
        }
        return h;
      })
    );
  }, []);

  /** 添加新习惯 */
  const addHabit = useCallback((name: string, emoji: string) => {
    const id = createId("habit");
    setHabits((prev) => [
      ...prev,
      { id, name, emoji, doneToday: false, streak: 0 },
    ]);
  }, []);

  /** 删除习惯 */
  const removeHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  /** 打卡 / 取消打卡 */
  const toggleHabit = useCallback((id: string) => {
    const today = getLocalDateString();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const toggled = !h.doneToday;

        // 计算连续天数：打卡 → 看昨天是否连续；取消 → streak 不动
        let newStreak = h.streak;
        if (toggled) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const y = yesterday.toISOString().slice(0, 10);
          newStreak = h.lastDoneDate === y ? h.streak + 1 : 1;
        }

        return {
          ...h,
          doneToday: toggled,
          lastDoneDate: toggled ? today : h.lastDoneDate,
          streak: toggled ? newStreak : h.streak,
        };
      })
    );
  }, []);

  return { habits, addHabit, removeHabit, toggleHabit };
}

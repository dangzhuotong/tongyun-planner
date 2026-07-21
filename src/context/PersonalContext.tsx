import React, { useState, useCallback, useEffect, useRef } from "react";
import type { Attachment, JournalEntry } from "../types";
import { createId } from "../utils/id";
import { safeJsonParse } from "../utils/json";
import { useDebouncedPersistence } from "../hooks/useDebouncedPersistence";
import { syncEngine } from "../utils/sync/engine";
import { bumpSyncVersion, bumpCategoryVersion, type SyncCategory } from "../utils/sync/types";

interface PersonalState {
  // 日记
  journal: JournalEntry[];
  handleUpsertJournal: (entry: JournalEntry) => void;
  handleDeleteJournal: (id: string) => void;
  journalAddTodo: boolean;
  handleToggleJournalAddTodo: (value: boolean) => void;
  // 心情
  moods: Record<string, number>;
  handleSetMood: (date: string, mood: number) => void;
  moodNotes: Record<string, string>;
  handleSetMoodNote: (date: string, note: string) => void;
  moodAttachments: Record<string, Attachment[]>;
  handleSetMoodAttachments: (date: string, attachments: Attachment[]) => void;
  // 习惯
  habits: { id: string; title: string; emoji: string }[];
  habitLogs: Record<string, string[]>;
  handleAddHabit: (title: string, emoji: string) => void;
  handleDeleteHabit: (id: string) => void;
  handleToggleHabitLog: (habitId: string, date: string) => void;
  // 日历导航
  calendarYear: number;
  setCalendarYear: React.Dispatch<React.SetStateAction<number>>;
  calendarMonth: number;
  setCalendarMonth: React.Dispatch<React.SetStateAction<number>>;
  selectedCalendarDate: string;
  setSelectedCalendarDate: (d: string) => void;
  // 原始 setter（供 App 的跨窗口 restore / applySync 调用）
  setJournal: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  setHabits: React.Dispatch<React.SetStateAction<{ id: string; title: string; emoji: string }[]>>;
  setHabitLogs: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setMoods: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setMoodNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setMoodAttachments: React.Dispatch<React.SetStateAction<Record<string, Attachment[]>>>;
}

const PersonalContext = React.createContext<PersonalState | null>(null);

export function usePersonal(): PersonalState {
  const ctx = React.useContext(PersonalContext);
  if (!ctx) throw new Error("usePersonal must be used within PersonalProvider");
  return ctx;
}

function sanitizeMoodAttachments(raw: Record<string, Attachment[]>): Record<string, Attachment[]> {
  const out: Record<string, Attachment[]> = {};
  for (const [date, list] of Object.entries(raw || {})) {
    if (!Array.isArray(list)) continue;
    const cleaned = list.filter((a) => {
      if (!a || typeof a !== "object") return false;
      const path = typeof a.path === "string" ? a.path : "";
      if (!path) return false;
      // 丢弃 legacy data: / base64 内联；sync 文本 payload 本就不含附件二进制
      if (path.startsWith("data:")) return false;
      return true;
    });
    if (cleaned.length > 0) out[date] = cleaned;
  }
  return out;
}

export function PersonalProvider({ children }: { children: React.ReactNode }) {
  const [journal, setJournal] = useState<JournalEntry[]>(() =>
    safeJsonParse(localStorage.getItem("tongyun_journal") || "[]", [])
  );
  const [journalAddTodo, setJournalAddTodo] = useState<boolean>(() =>
    safeJsonParse(localStorage.getItem("tongyun_journal_add_todo") || "false", false)
  );
  const handleToggleJournalAddTodo = useCallback((value: boolean) => {
    setJournalAddTodo(value);
    localStorage.setItem("tongyun_journal_add_todo", JSON.stringify(value));
  }, []);
  const handleUpsertJournal = useCallback((entry: JournalEntry) => {
    setJournal((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      return idx >= 0 ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev];
    });
  }, []);
  const handleDeleteJournal = useCallback((id: string) => {
    setJournal((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const [habits, setHabits] = useState<{ id: string; title: string; emoji: string }[]>(() =>
    safeJsonParse(localStorage.getItem("tongyun_habits") || "[]", [])
  );
  const [habitLogs, setHabitLogs] = useState<Record<string, string[]>>(() =>
    safeJsonParse(localStorage.getItem("tongyun_habit_logs") || "{}", {})
  );
  const handleAddHabit = useCallback((title: string, emoji: string) => {
    const newHabit = { id: createId("habit"), title, emoji };
    setHabits((prev) => [...prev, newHabit]);
  }, []);
  const handleDeleteHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);
  const handleToggleHabitLog = useCallback((habitId: string, date: string) => {
    setHabitLogs((prev) => {
      const dayLogs = prev[date] || [];
      return {
        ...prev,
        [date]: dayLogs.includes(habitId)
          ? dayLogs.filter((id) => id !== habitId)
          : [...dayLogs, habitId],
      };
    });
  }, []);

  const [moods, setMoods] = useState<Record<string, number>>(() =>
    safeJsonParse(localStorage.getItem("tongyun_moods") || "{}", {})
  );
  const [moodNotes, setMoodNotes] = useState<Record<string, string>>(() =>
    safeJsonParse(localStorage.getItem("tongyun_mood_notes") || "{}", {})
  );
  const [moodAttachments, setMoodAttachments] = useState<Record<string, Attachment[]>>(() =>
    sanitizeMoodAttachments(safeJsonParse(localStorage.getItem("tongyun_mood_attachments") || "{}", {}))
  );
  const handleSetMood = useCallback((date: string, mood: number) => {
    setMoods((prev) => ({ ...prev, [date]: mood }));
  }, []);
  const handleSetMoodNote = useCallback((date: string, note: string) => {
    setMoodNotes((prev) => ({ ...prev, [date]: note }));
  }, []);
  const handleSetMoodAttachments = useCallback((date: string, attachments: Attachment[]) => {
    setMoodAttachments((prev) => ({
      ...prev,
      [date]: attachments.filter((a) => a?.path && !String(a.path).startsWith("data:")),
    }));
  }, []);

  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(
    safeJsonParse(localStorage.getItem("tongyun_selected_date") || '""', "")
  );

  // ============ 本地持久化（防抖）============
  useDebouncedPersistence(journal, "tongyun_journal", 250);
  useDebouncedPersistence(habits, "tongyun_habits", 250);
  useDebouncedPersistence(habitLogs, "tongyun_habit_logs", 250);
  useDebouncedPersistence(moods, "tongyun_moods", 250);
  useDebouncedPersistence(moodNotes, "tongyun_mood_notes", 250);
  // 附件只存 path 元数据（二进制在 storageManager）；debounce 稍长即可
  useDebouncedPersistence(moodAttachments, "tongyun_mood_attachments", 600);

  // ============ sync 脏标记（仅个人数据分类）============
  const isFirstLoad = useRef(true);
  const prevRef = useRef<{
    journal: JournalEntry[]; habits: { id: string; title: string; emoji: string }[];
    habitLogs: Record<string, string[]>; moods: Record<string, number>;
  } | null>(null);
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      prevRef.current = { journal, habits, habitLogs, moods };
      return;
    }
    const prev = prevRef.current;
    const changed: SyncCategory[] = [];
    if (!prev || prev.journal !== journal) changed.push("journal");
    if (!prev || prev.habits !== habits || prev.habitLogs !== habitLogs || prev.moods !== moods)
      changed.push("habits");
    prevRef.current = { journal, habits, habitLogs, moods };
    if (changed.length === 0) return;
    bumpSyncVersion();
    for (const c of changed) {
      bumpCategoryVersion(c);
      syncEngine.markDirty(c);
    }
  }, [journal, habits, habitLogs, moods]);

  const value: PersonalState = {
    journal, handleUpsertJournal, handleDeleteJournal,
    journalAddTodo, handleToggleJournalAddTodo,
    moods, handleSetMood, moodNotes, handleSetMoodNote, moodAttachments, handleSetMoodAttachments,
    habits, habitLogs, handleAddHabit, handleDeleteHabit, handleToggleHabitLog,
    calendarYear, setCalendarYear, calendarMonth, setCalendarMonth,
    selectedCalendarDate, setSelectedCalendarDate,
    setJournal, setHabits, setHabitLogs, setMoods, setMoodNotes, setMoodAttachments,
  };

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

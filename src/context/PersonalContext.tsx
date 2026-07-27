import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { JournalEntry } from "../types";
import { safeJsonParse } from "../utils/json";
import { useDebouncedPersistence } from "../hooks/useDebouncedPersistence";
import { syncEngine } from "../utils/sync/engine";
import { bumpSyncVersion, bumpCategoryVersion, type SyncCategory } from "../utils/sync/types";
import { isSyncApplying } from "../utils/sync/syncApplyGuard";
import { storage } from "../utils/unifiedStorage";

interface PersonalState {
  // 日记
  journal: JournalEntry[];
  handleUpsertJournal: (entry: JournalEntry) => void;
  handleDeleteJournal: (id: string) => void;
  journalAddTodo: boolean;
  handleToggleJournalAddTodo: (value: boolean) => void;
  // 日历导航
  calendarYear: number;
  setCalendarYear: React.Dispatch<React.SetStateAction<number>>;
  calendarMonth: number;
  setCalendarMonth: React.Dispatch<React.SetStateAction<number>>;
  selectedCalendarDate: string;
  setSelectedCalendarDate: (d: string) => void;
  // 原始 setter（供 App 的跨窗口 restore / applySync 调用）
  setJournal: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
}

const PersonalContext = React.createContext<PersonalState | null>(null);

export function usePersonal(): PersonalState {
  const ctx = React.useContext(PersonalContext);
  if (!ctx) throw new Error("usePersonal must be used within PersonalProvider");
  return ctx;
}

export function PersonalProvider({ children }: { children: React.ReactNode }) {
  const [journal, setJournal] = useState<JournalEntry[]>(() =>
    safeJsonParse(localStorage.getItem("tongyun_journal") || "[]", [])
  );
  const [persistReady, setPersistReady] = useState(false);
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

  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(
    safeJsonParse(localStorage.getItem("tongyun_selected_date") || '""', "")
  );

  // 等 SQLite 灌回 localStorage 后再持久化，避免开发启动时用空 [] 盖掉已有日记
  useEffect(() => {
    let cancelled = false;
    storage.init().then(() => {
      if (cancelled) return;
      const fresh = safeJsonParse<JournalEntry[]>(localStorage.getItem("tongyun_journal") || "[]", []);
      setJournal(fresh);
      setPersistReady(true);
    }).catch(() => {
      if (!cancelled) setPersistReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useDebouncedPersistence(journal, "tongyun_journal", 250, persistReady);

  const isFirstLoad = useRef(true);
  const prevJournal = useRef<JournalEntry[] | null>(null);
  useEffect(() => {
    if (!persistReady) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      prevJournal.current = journal;
      return;
    }
    if (prevJournal.current === journal) return;
    prevJournal.current = journal;
    // 云端回写不 bump / 不标脏，防止空本地再次推上去
    if (isSyncApplying()) return;
    const changed: SyncCategory[] = ["journal"];
    bumpSyncVersion();
    for (const c of changed) {
      bumpCategoryVersion(c);
      syncEngine.markDirty(c);
    }
  }, [journal, persistReady]);

  const value = useMemo<PersonalState>(() => ({
    journal, handleUpsertJournal, handleDeleteJournal,
    journalAddTodo, handleToggleJournalAddTodo,
    calendarYear, setCalendarYear, calendarMonth, setCalendarMonth,
    selectedCalendarDate, setSelectedCalendarDate,
    setJournal,
  }), [
    journal, handleUpsertJournal, handleDeleteJournal,
    journalAddTodo, handleToggleJournalAddTodo,
    calendarYear, calendarMonth, selectedCalendarDate,
  ]);

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

import React, { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { subscribeDevSync } from "./useSync";
import type { Task, JournalEntry, Locale } from "../types";
import type { useTasks } from "./useTasks";
import type { usePomodoro } from "./usePomodoro";
import type { useStickyNotes } from "./useStickyNotes";
import type { useWidget } from "./useWidget";
import type { useCustomization } from "./useCustomization";

interface Handlers {
  tasksHook: ReturnType<typeof useTasks>;
  pomodoroHook: ReturnType<typeof usePomodoro>;
  notesHook: ReturnType<typeof useStickyNotes>;
  countdownHook: { setCountdowns: (v: any[]) => void };
  customizationHook: ReturnType<typeof useCustomization>;
  widgetHook: ReturnType<typeof useWidget>;
  setLocale: (locale: Locale) => void;
}

export function useCrossWindowSync(
  handlersRef: React.MutableRefObject<Handlers>,
  windowLabelRef: React.MutableRefObject<string>,
  setJournal: (v: JournalEntry[]) => void,
) {
  useEffect(() => {
    const handleSyncPayload = (p: any) => {
      if (p.source_window && p.source_window === windowLabelRef.current) return;
      const { tasksHook: tH, pomodoroHook: pH, notesHook: nH, widgetHook: wH, customizationHook: cH } = handlersRef.current;
      switch (p.action) {
        case "complete":
          tH.handleComplete(p.task_id, false);
          break;
        case "undo_complete":
          tH.handleUndoComplete(p.task_id, false);
          break;
        case "delete":
          tH.handleDeleteTask(p.task_id, false);
          break;
        case "snooze":
          tH.handleSnooze(p.task_id, false);
          break;
        case "add": {
          const newTask: Task = {
            id: p.task_id,
            title: p.title || "无题任务",
            notes: p.notes || undefined,
            description: p.description || undefined,
            category: p.category || "urgent-important",
            dueDate: p.due_date || undefined,
            dueTime: p.due_time || undefined,
          };
          tH.setTasks((prev: Task[]) => {
            const updated = [newTask, ...prev.filter((t: Task) => t.id !== newTask.id)];
            tH.saveTasks(updated);
            return updated;
          });
          break;
        }
        case "favorite_sync":
          tH.setTasks((prev: Task[]) => {
            const updated = prev.map((t) => t.id === p.task_id ? { ...t, isFavorite: p.title === "true" } : t);
            tH.saveTasks(updated);
            return updated;
          });
          break;
        case "pin_sync":
          tH.setTasks((prev: Task[]) => {
            const updated = prev.map((t) => t.id === p.task_id ? { ...t, isPinned: p.title === "true" } : t);
            tH.saveTasks(updated);
            return updated;
          });
          break;
        case "update":
          tH.setTasks((prev: Task[]) => {
            const updated = prev.map((t) => {
              if (t.id !== p.task_id) return t;
              const next: Task = { ...t };
              if (p.title != null && p.title !== "") next.title = p.title;
              if (p.description != null) next.description = p.description || undefined;
              if (p.category != null && p.category !== "") next.category = p.category as Task["category"];
              if (p.notes != null) next.notes = p.notes || undefined;
              if (p.due_date != null) next.dueDate = p.due_date || undefined;
              if (p.due_time != null) next.dueTime = p.due_time || undefined;
              return next;
            });
            tH.saveTasks(updated);
            return updated;
          });
          break;
        case "reset":
          tH.setTasks(tH.INITIAL_TASKS);
          tH.setCompletedTasks([]);
          tH.saveTasks(tH.INITIAL_TASKS);
          tH.saveCompleted([]);
          break;
        case "clear_completed":
          tH.setCompletedTasks([]);
          tH.saveCompleted([]);
          break;
        case "lock_widget":
          wH.setIsWidgetLocked(true);
          break;
        case "unlock_widget":
          wH.setIsWidgetLocked(false);
          break;
        case "toggle_lock_from_tray":
          if (windowLabelRef.current === "main") wH.handleToggleWidgetLock();
          break;
        case "pomodoro_sync":
          try {
            const data = JSON.parse(p.title);
            pH.setPomodoroIsActive(data.active);
            pH.setPomodoroTimeLeft(data.timeLeft);
            pH.setPomodoroIsBreak(data.isBreak);
            pH.setFocusDuration(data.focusDuration);
            pH.setBreakDuration(data.breakDuration);
            pH.setPomodoroSessionCount(data.sessionCount);
            pH.setPomodoroTaskId(data.taskId || null);
            pH.setPomodoroTaskTitle(data.taskTitle || null);
            pH.setPomodoroEndTime(data.endTime);
          } catch { /* invalid pomodoro sync payload */ }
          break;
        case "add_pomodoro_log":
          try {
            const log = JSON.parse(p.title);
            pH.setPomodoroLogs((prev: any[]) => [log, ...prev.filter((l: any) => l.id !== log.id)]);
          } catch { /* invalid pomodoro log sync payload */ }
          break;
        case "add_note":
          try {
            const note = JSON.parse(p.title);
            nH.setStickyNotes((prev: any[]) => [note, ...prev.filter((n: any) => n.id !== note.id)]);
          } catch { /* invalid note sync payload */ }
          break;
        case "edit_note_text":
          nH.setStickyNotes((prev: any[]) => prev.map((n) => n.id === p.task_id ? { ...n, text: p.title } : n));
          break;
        case "edit_note_title":
          nH.setStickyNotes((prev: any[]) => prev.map((n) => n.id === p.task_id ? { ...n, title: p.title } : n));
          break;
        case "change_note_color":
          nH.setStickyNotes((prev: any[]) => prev.map((n) => n.id === p.task_id ? { ...n, color: p.title } : n));
          break;
        case "delete_note":
          nH.setStickyNotes((prev: any[]) => prev.filter((n) => n.id !== p.task_id));
          break;
        case "settings_sync":
          try {
            const config = JSON.parse(p.title);
            cH.setCustomizationConfig(config);
          } catch { /* invalid settings sync payload */ }
          break;
        case "restore_sync":
          try {
            const restored = JSON.parse(p.title);
            const tasks = restored.tasks || [];
            const completed = restored.completedTasks || [];
            const notes = restored.stickyNotes || [];
            tH.setTasks(tasks);
            tH.saveTasks(tasks);
            tH.setCompletedTasks(completed);
            tH.saveCompleted(completed);
            nH.setStickyNotes(notes);
            setJournal(restored.journal || []);
            localStorage.setItem("tongyun_journal", JSON.stringify(restored.journal || []));
            cH.setCustomizationConfig(restored.customizationConfig || cH.DEFAULT_CUSTOMIZATION_CONFIG);
          } catch { /* invalid restore sync payload */ }
          break;
      }
    };

    const unlistenPromise = listen("todo-sync-event", (event: any) => handleSyncPayload(event.payload)).catch(() => undefined);
    const unsubDev = subscribeDevSync((event) => handleSyncPayload(event.payload));

    return () => {
      unlistenPromise.then((unlisten) => { if (typeof unlisten === "function") unlisten(); }).catch(() => {});
      unsubDev();
    };
  }, []);
}

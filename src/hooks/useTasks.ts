import { useState, useCallback } from "react";
import type { Task, SubTask } from "../types";
import { useSync } from "./useSync";
import { createId } from "../utils/id";
import { addLocalDays, addLocalMonths, getLocalDateString } from "../utils/date";
import { getNextRRuleDate } from "../utils/rrule";
import { scheduleStorageWrite } from "../utils/deferredStorage";

function createInitialTasks(): Task[] {
  const today = getLocalDateString();
  return [
    { id: "1", title: "设计待办清单配色与主题风格", description: "选用暖色奶茶背景、抹茶绿和蜜桃红,构建温馨清爽的日程规划风格。", category: "urgent-important", dueDate: today },
    { id: "2", title: "体验白噪音与番茄工作法", description: "在侧边栏开启白噪音,配合25分钟番茄时钟,体验极致专注手感。", category: "urgent-important", dueDate: today },
    { id: "3", title: "整理桌面与给绿植浇水", description: "整理房间和摆件,让生活空间与心情一起回归清爽自然。", category: "important-not-urgent", dueDate: today },
    { id: "4", title: "购买并补给浅烘咖啡豆", description: "生活日常补给,准备片刻的手冲咖啡度过下午。", category: "urgent-not-important", dueDate: today },
  ];
}

const INITIAL_TASKS = createInitialTasks();

function getNextDueDate(currentDue: string | undefined, repeat: string): string | undefined {
  if (!repeat || repeat === "none") return undefined;
  if (repeat === "daily") return addLocalDays(currentDue, 1);
  if (repeat === "weekly") return addLocalDays(currentDue, 7);
  if (repeat === "monthly") return addLocalMonths(currentDue, 1);
  return getNextRRuleDate(currentDue!, repeat);
}

export function useTasks() {
  const { syncState } = useSync();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<{ task: Task; wasCompleted: boolean } | null>(null);

  // 持久化只写 localStorage；unifiedStorage 会自动 debounce 同步到 SQLite。
  const saveTasks = useCallback(async (updatedTasks: Task[]) => {
    try {
      scheduleStorageWrite("aero_todos", updatedTasks);
      scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
    } catch (e) {
      console.error("保存任务失败", e);
    }
  }, []);

  const saveCompleted = useCallback(async (updatedCompleted: Task[]) => {
    try {
      scheduleStorageWrite("aero_completed_todos", updatedCompleted);
      scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
    } catch (e) {
      console.error("保存已完成任务失败", e);
    }
  }, []);

  /** 原子写入 tasks + completedTasks，避免分开写各写一次 timestamp */
  const saveAll = useCallback(async (updatedTasks: Task[], updatedCompleted: Task[]) => {
    try {
      scheduleStorageWrite("aero_todos", updatedTasks);
      scheduleStorageWrite("aero_completed_todos", updatedCompleted);
      scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
    } catch (e) {
      console.error("批量保存失败", e);
    }
  }, []);

  const totalCount = tasks.length + completedTasks.length;
  const progressPercentage = totalCount === 0 ? 0 : Math.round((completedTasks.length / totalCount) * 100);

  const handleComplete = useCallback((id: string, shouldSync: boolean = true) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    if (task.dependsOn && task.dependsOn.length > 0) {
      const allCompleted = task.dependsOn.every(depId =>
        !tasks.find(t => t.id === depId)
      );
      if (!allCompleted) return;
    }

    const completed: Task = { ...task, completedAt: Date.now() };
    let updatedTasks: Task[];
    if (task.repeat && task.repeat !== "none") {
      const { completedAt: _drop, ...base } = task;
      const nextDue = getNextDueDate(task.dueDate, task.repeat);
      updatedTasks = [{ ...base, id: createId("task"), dueDate: nextDue }, ...tasks.filter(t => t.id !== id)];
    } else {
      updatedTasks = tasks.filter(t => t.id !== id);
    }

    const nextCompleted = [completed, ...completedTasks.filter(t => t.id !== id)];
    setTasks(updatedTasks);
    setCompletedTasks(nextCompleted);
    saveAll(updatedTasks, nextCompleted);

    if (shouldSync) syncState(id, "complete");
  }, [tasks, completedTasks, saveAll, syncState]);

  const handleUndoComplete = useCallback((id: string, shouldSync: boolean = true) => {
    let restoredItem: Task | undefined;
    setCompletedTasks((cPrev) => {
      restoredItem = cPrev.find((t) => t.id === id);
      const cUpdated = cPrev.filter((t) => t.id !== id);
      saveCompleted(cUpdated);
      return cUpdated;
    });

    if (restoredItem) {
      const { completedAt: _drop, ...restored } = restoredItem;
      setTasks((prev) => {
        const updated = [restored, ...prev];
        saveTasks(updated);
        return updated;
      });
    }

    if (shouldSync) syncState(id, "undo_complete");
  }, [saveTasks, saveCompleted, syncState]);

  const handleToggleFavorite = useCallback((id: string) => {
    // 直接在 setState updater 内部计算 nextFav,取到新值后一次性广播,不再用 setTimeout(0)
    // 避免"点击-广播-落盘"三者之间的竞态
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;
      const nextFav = !task.isFavorite;
      const updated = prev.map((t) => (t.id === id ? { ...t, isFavorite: nextFav } : t));
      saveTasks(updated);
      // 广播放到微任务,避免在 setState updater 内直接触发 async invoke
      queueMicrotask(() => syncState(id, "favorite_sync", nextFav ? "true" : "false"));
      return updated;
    });
  }, [saveTasks, syncState]);

  const handleTogglePin = useCallback((id: string) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;
      const nextPin = !task.isPinned;
      const updated = prev.map((t) => (t.id === id ? { ...t, isPinned: nextPin } : t));
      saveTasks(updated);
      queueMicrotask(() => syncState(id, "pin_sync", nextPin ? "true" : "false"));
      return updated;
    });
  }, [saveTasks, syncState]);

  const handleDeleteTask = useCallback((id: string, shouldSync: boolean = true) => {
    const fromActive = tasks.find((t) => t.id === id);
    const fromCompleted = !fromActive ? completedTasks.find((t) => t.id === id) : undefined;
    if (fromActive) {
      setLastDeleted({ task: fromActive, wasCompleted: false });
    } else if (fromCompleted) {
      setLastDeleted({ task: fromCompleted, wasCompleted: true });
    } else {
      setLastDeleted(null);
    }

    setTasks((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      return updated;
    });
    setCompletedTasks((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      return updated;
    });
    // 原子写入：del 后 tasks/completedTasks 都已更新，React 18 自动批处理
    const filteredActive = tasks.filter((t) => t.id !== id);
    const filteredCompleted = completedTasks.filter((t) => t.id !== id);
    saveAll(filteredActive, filteredCompleted);
    setDetailTaskId((prev) => (prev === id ? null : prev));
    if (shouldSync) syncState(id, "delete");
  }, [tasks, completedTasks, saveAll, syncState]);

  const handleUndoDelete = useCallback((shouldSync: boolean = true) => {
    if (!lastDeleted) return;
    const { task, wasCompleted } = lastDeleted;
    setLastDeleted(null);

    if (wasCompleted) {
      setCompletedTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        const updated = [task, ...prev];
        saveCompleted(updated);
        return updated;
      });
      if (shouldSync) syncState(task.id, "complete");
    } else {
      setTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        const updated = [task, ...prev];
        saveTasks(updated);
        return updated;
      });
      if (shouldSync) {
        syncState(
          task.id,
          "add",
          task.title,
          task.description || "",
          task.category,
          task.notes || "",
          task.dueDate,
          task.dueTime
        );
      }
    }
  }, [lastDeleted, saveTasks, saveCompleted, syncState]);

  const handleTaskClick = useCallback((task: Task) => {
    setDetailTaskId(task.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailTaskId(null);
  }, []);

  const handleToggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    let matchedInActive = false;
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task) return prev;
      matchedInActive = true;
      const subtasks = (task.subtasks || []).map((s) =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );
      const nextTask = { ...task, subtasks };
      const updated = prev.map((t) => (t.id === taskId ? nextTask : t));
      saveTasks(updated);
      queueMicrotask(() => syncState(taskId, "update", nextTask.title, nextTask.description, nextTask.category, nextTask.notes, nextTask.dueDate, nextTask.dueTime));
      return updated;
    });
    if (!matchedInActive) {
      setCompletedTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        const subtasks = (task.subtasks || []).map((s) =>
          s.id === subtaskId ? { ...s, completed: !s.completed } : s
        );
        const nextTask = { ...task, subtasks };
        const updated = prev.map((t) => (t.id === taskId ? nextTask : t));
        saveCompleted(updated);
        return updated;
      });
    }
  }, [saveTasks, saveCompleted, syncState]);

  const handleAddSubtask = useCallback((taskId: string, title: string) => {
    let matchedInActive = false;
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task) return prev;
      matchedInActive = true;
      const newSub: SubTask = { id: createId("subtask"), title, completed: false };
      const nextTask = { ...task, subtasks: [...(task.subtasks || []), newSub] };
      const updated = prev.map((t) => (t.id === taskId ? nextTask : t));
      saveTasks(updated);
      queueMicrotask(() => syncState(taskId, "update", nextTask.title, nextTask.description, nextTask.category, nextTask.notes, nextTask.dueDate, nextTask.dueTime));
      return updated;
    });
    if (!matchedInActive) {
      setCompletedTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        const newSub: SubTask = { id: createId("subtask"), title, completed: false };
        const nextTask = { ...task, subtasks: [...(task.subtasks || []), newSub] };
        const updated = prev.map((t) => (t.id === taskId ? nextTask : t));
        saveCompleted(updated);
        return updated;
      });
    }
  }, [saveTasks, saveCompleted, syncState]);

  const handleSnooze = useCallback((id: string, shouldSync: boolean = true) => {
    setTasks((prev) => {
      const item = prev.find((t) => t.id === id);
      if (!item) return prev;
      // 显式:先从原位置移除,再追加到末尾
      const rest = prev.filter((t) => t.id !== id);
      const next = [...rest, item];
      saveTasks(next);
      return next;
    });
    if (shouldSync) syncState(id, "snooze");
  }, [saveTasks, syncState]);

    const handleAddTask = useCallback(async (taskData: {
    title: string;
    description: string;
    notes: string;
    category: Task["category"];
    dueDate: string;
    dueTime?: string;
    isExplicit?: boolean;
    repeat?: string;
    tags?: string[];
    priority?: Task["priority"];
  }) => {
    const { title, description, notes, category, dueDate, dueTime, repeat, tags, priority } = taskData;
    const taskId = createId("task");
    const initialCategory = category;

    const newTask: Task = {
      id: taskId,
      title,
      description: description || undefined,
      notes: notes || undefined,
      category: initialCategory,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      repeat: repeat || undefined,
      tags: tags || undefined,
      priority: priority || undefined,
    };

    setTasks((prev) => {
      const updated = [newTask, ...prev];
      saveTasks(updated);
      return updated;
    });

    syncState(
      newTask.id,
      "add",
      newTask.title,
      newTask.description || "",
      newTask.category,
      newTask.notes || "",
      newTask.dueDate,
      newTask.dueTime
    );

    return { taskId, newTask };
  }, [saveTasks, syncState]);

  const handleEditTask = useCallback((id: string, updates: Partial<Task>) => {
    let matchedInActive = false;
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;
      matchedInActive = true;
      const nextTask = { ...task, ...updates };
      queueMicrotask(() => {
        syncState(id, "update", nextTask.title, nextTask.description, nextTask.category, nextTask.notes, nextTask.dueDate, nextTask.dueTime);
      });
      const updated = prev.map((t) => (t.id === id ? nextTask : t));
      saveTasks(updated);
      return updated;
    });
    if (!matchedInActive) {
      setCompletedTasks((prev) => {
        const task = prev.find((t) => t.id === id);
        if (!task) return prev;
        const nextTask = { ...task, ...updates };
        const updated = prev.map((t) => (t.id === id ? nextTask : t));
        saveCompleted(updated);
        return updated;
      });
    }
  }, [saveTasks, saveCompleted, syncState]);

  const handleSaveNotes = useCallback((id: string, notes: string) => {
    handleEditTask(id, { notes: notes || undefined });
    setExpandedNoteId(null);
  }, [handleEditTask]);

  const handleUpdateTags = useCallback((id: string, tags: string[]) => {
    handleEditTask(id, { tags: tags.length > 0 ? tags : undefined });
  }, [handleEditTask]);

  const resetTasks = useCallback(() => {
    const freshTasks = createInitialTasks();
    setTasks(freshTasks);
    setCompletedTasks([]);
    saveAll(freshTasks, []);
    syncState("reset", "reset");
  }, [saveAll, syncState]);

  const handleClearCompleted = useCallback(() => {
    setCompletedTasks([]);
    saveCompleted([]);
    syncState("clear_completed", "clear_completed");
  }, [saveCompleted, syncState]);

  return {
    tasks,
    setTasks,
    completedTasks,
    setCompletedTasks,
    expandedNoteId,
    setExpandedNoteId,
    editingNotes,
    setEditingNotes,
    detailTaskId,
    setDetailTaskId,
    saveTasks,
    saveCompleted,
    saveAll,
    progressPercentage,
    handleComplete,
    handleUndoComplete,
    handleToggleFavorite,
    handleTogglePin,
    handleDeleteTask,
    handleUndoDelete,
    lastDeleted,
    handleTaskClick,
    handleCloseDetail,
    handleToggleSubtask,
    handleAddSubtask,
    handleSnooze,
    handleAddTask,
    handleEditTask,
    handleSaveNotes,
    handleUpdateTags,
    resetTasks,
    handleClearCompleted,
    INITIAL_TASKS,
  };
}

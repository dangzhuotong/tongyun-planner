import { useState, useCallback } from "react";
import type { Task, SubTask } from "../types";
import { useSync } from "./useSync";
import { createId } from "../utils/id";
import { getLocalDateString } from "../utils/date";
import { applyDueAnchor, withMonthlyAnchor } from "../utils/nextDueDate";
import { scheduleStorageWrite } from "../utils/deferredStorage";
import { taskRepository } from "../data/repositories";
import { syncEngine } from "../utils/sync/engine";
import { dismissJournalTodo, restoreJournalTodo } from "../utils/journalTodoLink";
import { completeTask, undoTaskCompletion, type TaskCompletion } from "../utils/taskCompletion";

function createInitialTasks(): Task[] {
  const today = getLocalDateString();
  return [
    {
      id: "1",
      title: "设计待办清单配色与主题风格",
      description: "选用暖色奶茶背景、抹茶绿和蜜桃红,构建温馨清爽的日程规划风格。",
      category: "urgent-important",
      dueDate: today,
    },
    {
      id: "2",
      title: "体验白噪音与番茄工作法",
      description: "在侧边栏开启白噪音,配合25分钟番茄时钟,体验极致专注手感。",
      category: "urgent-important",
      dueDate: today,
    },
    {
      id: "3",
      title: "整理桌面与给绿植浇水",
      description: "整理房间和摆件,让生活空间与心情一起回归清爽自然。",
      category: "important-not-urgent",
      dueDate: today,
    },
    {
      id: "4",
      title: "购买并补给浅烘咖啡豆",
      description: "生活日常补给,准备片刻的手冲咖啡度过下午。",
      category: "urgent-not-important",
      dueDate: today,
    },
  ];
}

const INITIAL_TASKS = createInitialTasks();

export function useTasks() {
  const { syncState } = useSync();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<{ task: Task; wasCompleted: boolean } | null>(
    null,
  );
  // 持久化只写 localStorage；unifiedStorage 会自动 debounce 同步到 SQLite。
  const saveTasks = useCallback(async (updatedTasks: Task[]) => {
    try {
      scheduleStorageWrite("aero_todos", updatedTasks);
      scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
      taskRepository.syncActive(updatedTasks);
      syncEngine.markDirty("tasks");
    } catch (e) {
      console.error("保存任务失败", e);
    }
  }, []);

  const saveCompleted = useCallback(async (updatedCompleted: Task[]) => {
    try {
      scheduleStorageWrite("aero_completed_todos", updatedCompleted);
      scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
      taskRepository.syncCompleted(updatedCompleted);
      syncEngine.markDirty("completedTasks");
    } catch (e) {
      console.error("保存已完成任务失败", e);
    }
  }, []);

  const saveAll = useCallback(
    async (updatedTasks: Task[], updatedCompleted: Task[], markDirty = true) => {
      try {
        scheduleStorageWrite("aero_todos", updatedTasks);
        scheduleStorageWrite("aero_completed_todos", updatedCompleted);
        taskRepository.syncActive(updatedTasks);
        taskRepository.syncCompleted(updatedCompleted);
        if (markDirty) {
          scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
          syncEngine.markDirty("tasks", "completedTasks");
        }
      } catch (e) {
        console.error("批量保存失败", e);
      }
    },
    [],
  );

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeCompleted = Array.isArray(completedTasks) ? completedTasks : [];
  const totalCount = safeTasks.length + safeCompleted.length;
  const progressPercentage =
    totalCount === 0 ? 0 : Math.round((safeCompleted.length / totalCount) * 100);

  const safeSetTasks = useCallback((action: React.SetStateAction<Task[]>) => {
    setTasks((prev) => {
      const prevSafe = Array.isArray(prev) ? prev : [];
      const next = typeof action === "function" ? action(prevSafe) : action;
      return Array.isArray(next) ? next : prevSafe;
    });
  }, []);

  const safeSetCompletedTasks = useCallback((action: React.SetStateAction<Task[]>) => {
    setCompletedTasks((prev) => {
      const prevSafe = Array.isArray(prev) ? prev : [];
      const next = typeof action === "function" ? action(prevSafe) : action;
      return Array.isArray(next) ? next : prevSafe;
    });
  }, []);

  const handleComplete = useCallback(
    (id: string, shouldSync: boolean = true, syncedCompletion?: TaskCompletion) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;

      if (task.dependsOn && task.dependsOn.length > 0) {
        const allCompleted = task.dependsOn.every((depId) => !tasks.find((t) => t.id === depId));
        if (!allCompleted) return;
      }

      const generated = syncedCompletion ?? completeTask(task);
      const { completed } = generated;
      const successorId = generated.successor?.id;
      // Re-completing an undone occurrence must not overwrite later user work.
      const successor =
        successorId && !completedTasks.some((t) => t.id === successorId)
          ? (tasks.find((t) => t.id === successorId) ?? generated.successor)
          : undefined;
      const completion = { completed, successor };
      const remaining = tasks.filter((t) => t.id !== id && t.id !== successor?.id);
      const updatedTasks = successor ? [successor, ...remaining] : remaining;

      const nextCompleted = [completed, ...completedTasks.filter((t) => t.id !== id)];
      setTasks(updatedTasks);
      setCompletedTasks(nextCompleted);
      saveAll(updatedTasks, nextCompleted);

      if (shouldSync) syncState(id, "complete", JSON.stringify(completion));
    },
    [tasks, completedTasks, saveAll, syncState],
  );

  const handleUndoComplete = useCallback(
    (id: string, shouldSync: boolean = true) => {
      const restoredItem = completedTasks.find((t) => t.id === id);
      if (!restoredItem) return;

      const nextCompleted = completedTasks.filter((t) => t.id !== id);
      const nextTasks = undoTaskCompletion(restoredItem, tasks);
      // A partition upsert does not delete omitted rows; tombstone only the retracted successor.
      const successorId = restoredItem.repeatSuccessor?.id;
      if (
        successorId &&
        tasks.some((t) => t.id === successorId) &&
        !nextTasks.some((t) => t.id === successorId)
      ) {
        taskRepository.remove(successorId);
      }

      setCompletedTasks(nextCompleted);
      setTasks(nextTasks);
      saveAll(nextTasks, nextCompleted);

      if (shouldSync) syncState(id, "undo_complete");
    },
    [tasks, completedTasks, saveAll, syncState],
  );

  const handleToggleFavorite = useCallback(
    (id: string) => {
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
    },
    [saveTasks, syncState],
  );

  const handleTogglePin = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === id);
        if (!task) return prev;
        const nextPin = !task.isPinned;
        const updated = prev.map((t) => (t.id === id ? { ...t, isPinned: nextPin } : t));
        saveTasks(updated);
        queueMicrotask(() => syncState(id, "pin_sync", nextPin ? "true" : "false"));
        return updated;
      });
    },
    [saveTasks, syncState],
  );

  const handleDeleteTasks = useCallback(
    (ids: string[], shouldSync: boolean = true) => {
      if (ids.length === 0) return;
      const deletedIds = new Set(ids);
      const activeVictims = tasks.filter((task) => deletedIds.has(task.id));
      const completedVictims = completedTasks.filter((task) => deletedIds.has(task.id));
      const undoId = ids[ids.length - 1];
      const activeUndo = activeVictims.find((task) => task.id === undoId);
      const completedUndo = completedVictims.find((task) => task.id === undoId);
      setLastDeleted(
        activeUndo
          ? { task: activeUndo, wasCompleted: false }
          : completedUndo
            ? { task: completedUndo, wasCompleted: true }
            : null,
      );
      for (const task of [...activeVictims, ...completedVictims]) dismissJournalTodo(task);

      const keep = (task: Task) => !deletedIds.has(task.id);
      setTasks((prev) => prev.filter(keep));
      setCompletedTasks((prev) => prev.filter(keep));
      scheduleStorageWrite("aero_todos", tasks.filter(keep));
      scheduleStorageWrite("aero_completed_todos", completedTasks.filter(keep));
      scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
      for (const id of deletedIds) taskRepository.remove(id);
      if (activeVictims.length > 0) syncEngine.markDirty("tasks");
      if (completedVictims.length > 0) syncEngine.markDirty("completedTasks");
      setDetailTaskId((prev) => (prev && deletedIds.has(prev) ? null : prev));
      if (shouldSync) {
        if (ids.length === 1) syncState(ids[0], "delete");
        else syncState(ids[0], "delete_batch", JSON.stringify(ids));
      }
    },
    [tasks, completedTasks, syncState],
  );

  const handleDeleteTask = useCallback(
    (id: string, shouldSync: boolean = true) => handleDeleteTasks([id], shouldSync),
    [handleDeleteTasks],
  );

  const restoreDeletedTask = useCallback(
    (task: Task, wasCompleted: boolean) => {
      restoreJournalTodo(task);
      const setList = wasCompleted ? setCompletedTasks : setTasks;
      const saveList = wasCompleted ? saveCompleted : saveTasks;
      taskRepository.restore(task, wasCompleted);
      setList((prev) => {
        if (prev.some((item) => item.id === task.id)) return prev;
        const updated = [task, ...prev];
        saveList(updated);
        return updated;
      });
    },
    [saveTasks, saveCompleted],
  );

  const handleUndoDelete = useCallback(
    (shouldSync: boolean = true) => {
      if (!lastDeleted) return;
      const { task, wasCompleted } = lastDeleted;
      restoreDeletedTask(task, wasCompleted);
      setLastDeleted(null);
      if (shouldSync) syncState(task.id, "restore_deleted", JSON.stringify(lastDeleted));
    },
    [lastDeleted, restoreDeletedTask, syncState],
  );

  const handleTaskClick = useCallback((task: Task) => {
    setDetailTaskId(task.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailTaskId(null);
  }, []);

  const handleToggleSubtask = useCallback(
    (taskId: string, subtaskId: string) => {
      let matchedInActive = false;
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        matchedInActive = true;
        const subtasks = (task.subtasks || []).map((s) =>
          s.id === subtaskId ? { ...s, completed: !s.completed } : s,
        );
        const nextTask = { ...task, subtasks };
        const updated = prev.map((t) => (t.id === taskId ? nextTask : t));
        saveTasks(updated);
        queueMicrotask(() =>
          syncState(
            taskId,
            "update",
            nextTask.title,
            nextTask.description,
            nextTask.category,
            nextTask.notes,
            nextTask.dueDate,
            nextTask.dueTime,
          ),
        );
        return updated;
      });
      if (!matchedInActive) {
        setCompletedTasks((prev) => {
          const task = prev.find((t) => t.id === taskId);
          if (!task) return prev;
          const subtasks = (task.subtasks || []).map((s) =>
            s.id === subtaskId ? { ...s, completed: !s.completed } : s,
          );
          const nextTask = { ...task, subtasks };
          const updated = prev.map((t) => (t.id === taskId ? nextTask : t));
          saveCompleted(updated);
          return updated;
        });
      }
    },
    [saveTasks, saveCompleted, syncState],
  );

  const handleAddSubtask = useCallback(
    (taskId: string, title: string) => {
      let matchedInActive = false;
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        matchedInActive = true;
        const newSub: SubTask = { id: createId("subtask"), title, completed: false };
        const nextTask = { ...task, subtasks: [...(task.subtasks || []), newSub] };
        const updated = prev.map((t) => (t.id === taskId ? nextTask : t));
        saveTasks(updated);
        queueMicrotask(() =>
          syncState(
            taskId,
            "update",
            nextTask.title,
            nextTask.description,
            nextTask.category,
            nextTask.notes,
            nextTask.dueDate,
            nextTask.dueTime,
          ),
        );
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
    },
    [saveTasks, saveCompleted, syncState],
  );

  const handleSnooze = useCallback(
    (id: string, shouldSync: boolean = true) => {
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
    },
    [saveTasks, syncState],
  );

  const handleAddTask = useCallback(
    async (taskData: {
      title: string;
      description?: string;
      notes?: string;
      category?: Task["category"];
      dueDate?: string;
      dueTime?: string;
      isExplicit?: boolean;
      repeat?: string;
      tags?: string[];
      project?: string;
      priority?: Task["priority"];
      assigneeKind?: Task["assigneeKind"];
      assigneeAgentId?: Task["assigneeAgentId"];
      runStatus?: Task["runStatus"];
      pipelineTaskId?: Task["pipelineTaskId"];
      journalId?: string;
      id?: string;
    }) => {
      const { title, description, notes, category, dueDate, dueTime, repeat, tags, priority } =
        taskData;
      const taskId = taskData.id?.trim() || createId("task");
      const initialCategory = category || "important-not-urgent";
      const initialDueDate = dueDate || getLocalDateString();

      const newTask: Task = withMonthlyAnchor({
        id: taskId,
        title,
        description: description || undefined,
        notes: notes || undefined,
        category: initialCategory,
        dueDate: initialDueDate,
        dueTime: dueTime || undefined,
        repeat: repeat || undefined,
        tags: tags || undefined,
        project: taskData.project,
        priority: priority || undefined,
        assigneeKind: "human",
        pipelineTaskId: taskData.pipelineTaskId,
        journalId: taskData.journalId,
        updatedAt: Date.now(),
      });

      setTasks((prev) => {
        const updated = [newTask, ...prev];
        saveTasks(updated);
        return updated;
      });

      if (newTask.project) {
        syncState(taskId, "add_with_planning", JSON.stringify(newTask));
      } else {
        syncState(
          newTask.id,
          "add",
          newTask.title,
          newTask.description || "",
          newTask.category,
          newTask.notes || "",
          newTask.dueDate,
          newTask.dueTime,
        );

      }
      return { taskId, newTask };
    },
    [saveTasks, syncState],
  );

  const handleEditTask = useCallback(
    (id: string, updates: Partial<Task>) => {
      let matchedInActive = false;
      setTasks((prev) => {
        const task = prev.find((t) => t.id === id);
        if (!task) return prev;
        matchedInActive = true;
        const anchored = applyDueAnchor(task, updates);
        const nextTask = { ...anchored, ...updates, updatedAt: Date.now() };
        queueMicrotask(() => {
          syncState(
            id,
            "update",
            nextTask.title,
            nextTask.description,
            nextTask.category,
            nextTask.notes,
            nextTask.dueDate,
            nextTask.dueTime,
          );
          const planning: { project?: string | null; reminderOffsets?: number[] | null } = {};
          if ("project" in updates) planning.project = nextTask.project ?? null;
          if ("reminderOffsets" in updates) planning.reminderOffsets = nextTask.reminderOffsets ?? null;
          if (Object.keys(planning).length) syncState(id, "task_planning", JSON.stringify(planning));
        });
        const updated = prev.map((t) => (t.id === id ? nextTask : t));
        saveTasks(updated);
        return updated;
      });
      if (!matchedInActive) {
        setCompletedTasks((prev) => {
          const task = prev.find((t) => t.id === id);
          if (!task) return prev;
          const anchored = applyDueAnchor(task, updates);
          const nextTask = { ...anchored, ...updates, updatedAt: Date.now() };
          const updated = prev.map((t) => (t.id === id ? nextTask : t));
          saveCompleted(updated);
          return updated;
        });
      }
    },
    [saveTasks, saveCompleted, syncState],
  );

  const handleSaveNotes = useCallback(
    (id: string, notes: string) => {
      handleEditTask(id, { notes: notes || undefined });
      setExpandedNoteId(null);
    },
    [handleEditTask],
  );

  const handleUpdateTags = useCallback(
    (id: string, tags: string[]) => {
      handleEditTask(id, { tags: tags.length > 0 ? tags : undefined });
    },
    [handleEditTask],
  );

  /** WebDAV 整包覆盖、重置时用。日常改一条任务不要走这里。 */
  const replaceStoredTasks = useCallback(
    async (updatedTasks: Task[], updatedCompleted: Task[], markDirty = true) => {
      try {
        scheduleStorageWrite("aero_todos", updatedTasks);
        scheduleStorageWrite("aero_completed_todos", updatedCompleted);
        scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
        taskRepository.syncSnapshot(updatedTasks, updatedCompleted);
        if (markDirty) {
          syncEngine.markDirty("tasks", "completedTasks");
        }
      } catch (e) {
        console.error("整包替换任务失败", e);
      }
    },
    [],
  );

  const resetTasks = useCallback(() => {
    const freshTasks = createInitialTasks();
    setTasks(freshTasks);
    setCompletedTasks([]);
    replaceStoredTasks(freshTasks, []);
    syncState("reset", "reset");
  }, [replaceStoredTasks, syncState]);

  const handleClearCompleted = useCallback(
    (shouldSync: boolean = true) => {
      setCompletedTasks([]);
      taskRepository.removeCompleted(completedTasks.map(({ id }) => id));
      scheduleStorageWrite("aero_completed_todos", []);
      scheduleStorageWrite("tongyun_last_updated", String(Date.now()));
      syncEngine.markDirty("completedTasks");
      if (shouldSync) syncState("clear_completed", "clear_completed");
    },
    [completedTasks, syncState],
  );

  return {
    tasks: safeTasks,
    setTasks: safeSetTasks,
    completedTasks: safeCompleted,
    setCompletedTasks: safeSetCompletedTasks,
    expandedNoteId,
    setExpandedNoteId,
    editingNotes,
    setEditingNotes,
    detailTaskId,
    setDetailTaskId,
    saveTasks,
    saveCompleted,
    saveAll,
    replaceStoredTasks,
    progressPercentage,
    handleComplete,
    handleUndoComplete,
    handleToggleFavorite,
    handleTogglePin,
    handleDeleteTask,
    handleDeleteTasks,
    handleUndoDelete,
    restoreDeletedTask,
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

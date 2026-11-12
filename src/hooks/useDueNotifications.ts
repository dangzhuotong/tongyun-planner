import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getLocalDateString } from "../utils/date";
import { REMINDER_OFFSETS } from "../utils/taskOrganization";
import type { Task } from "../types";

export function customReminderTimes(task: Task): { offset: number; time: number }[] {
  if (!task.dueDate || !task.reminderOffsets?.length) return [];
  const due = Date.parse(`${task.dueDate}T${task.dueTime || "09:00"}:00`);
  if (!Number.isFinite(due)) return [];
  return REMINDER_OFFSETS.filter((offset) => task.reminderOffsets?.includes(offset)).map(
    (offset) => ({ offset, time: due - offset * 60_000 }),
  );
}

interface Reminder {
  taskId: string;
  title: string;
  body: string;
}

interface UseDueNotificationsOptions {
  isHydrated: boolean;
  locale: string;
  tasks: Task[];
  completedTasks: Task[];
  onOpenTask: (taskId: string) => void;
}

export function useDueNotifications({
  isHydrated,
  locale,
  tasks,
  completedTasks,
  onOpenTask,
}: UseDueNotificationsOptions) {
  const notifiedDueRef = useRef<Set<string>>(new Set());
  const snoozed = useRef(new Map<string, number>());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const dismiss = (id: string) =>
    setReminders((current) => current.filter((item) => item.taskId !== id));
  const snooze = (id: string) => {
    snoozed.current.set(id, Date.now() + 10 * 60_000);
    dismiss(id);
  };

  useEffect(() => {
    if (!isHydrated) return;

    const check = () => {
      try {
        const label = getCurrentWebviewWindow().label;
        if (label && label !== "main") return;
      } catch {
        return;
      }

      const enabledRaw = localStorage.getItem("tongyun_due_remind_enabled");
      if (enabledRaw === "0" || enabledRaw === "false") return;
      const beforeMinRaw = parseInt(
        localStorage.getItem("tongyun_due_remind_before_min") || "15",
        10,
      );
      const beforeMin = [5, 15, 30, 60].includes(beforeMinRaw) ? beforeMinRaw : 15;
      const REMIND_BEFORE = beforeMin * 60 * 1000;
      const DATE_ONLY_HOUR = 9;

      const now = new Date();
      const todayStr = getLocalDateString(now);
      const nowTs = now.getTime();
      const isZh = locale === "zh-CN";
      const completedIds = new Set(completedTasks.map((c) => c.id));
      const notify = (task: Task, key: string, body: string) => {
        if (notifiedDueRef.current.has(key)) return;
        notifiedDueRef.current.add(key);
        setReminders((current) => [
          ...current.filter((item) => item.taskId !== task.id),
          { taskId: task.id, title: task.title, body },
        ]);
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        try {
          const n = new Notification(isZh ? "任务提醒" : "Task Reminder", {
            body: `${task.title}\n${body}`,
            tag: `tongyun-due-${task.id}`,
            data: { taskId: task.id },
          });
          n.onclick = () => {
            onOpenTask(task.id);
            n.close();
          };
        } catch {
          // The in-app action remains available.
        }
      };
      for (const task of tasks) {
        if (completedIds.has(task.id)) continue;
        const deferred = snoozed.current.get(task.id);
        if (deferred !== undefined) {
          if (nowTs < deferred) continue;
          snoozed.current.delete(task.id);
          notify(task, `snooze:${task.id}:${deferred}`, isZh ? "稍后提醒" : "Snoozed reminder");
        }
        if (task.reminderOffsets !== undefined) {
          const custom = customReminderTimes(task);
          for (const { offset, time } of custom) {
            if (nowTs < time || nowTs >= time + 60 * 60_000) continue;
            const body =
              offset === 0
                ? isZh
                  ? "任务已到期"
                  : "Task is due"
                : isZh
                  ? `截止前 ${offset} 分钟提醒`
                  : `Reminder ${offset} min before due`;
            notify(task, `custom:${task.id}:${time}`, body);
          }
          continue;
        }
        if (task.dueDate !== todayStr) continue;

        let phase: "before" | "due" | "day" | null = null;
        let body = "";

        if (task.dueTime) {
          const [h, m] = task.dueTime.split(":").map(Number);
          if (Number.isNaN(h) || Number.isNaN(m)) continue;
          const dueTs = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            h,
            m,
            0,
            0,
          ).getTime();
          if (nowTs >= dueTs && nowTs <= dueTs + 60 * 60 * 1000) {
            phase = "due";
            body = isZh ? `已到截止时间 ${task.dueTime}` : `Due at ${task.dueTime}`;
          } else if (nowTs >= dueTs - REMIND_BEFORE && nowTs < dueTs) {
            phase = "before";
            const mins = Math.max(1, Math.round((dueTs - nowTs) / 60000));
            body = isZh
              ? mins <= 1
                ? `即将在 ${task.dueTime} 截止`
                : `还有 ${mins} 分钟（${task.dueTime}）截止`
              : mins <= 1
                ? `Due at ${task.dueTime}`
                : `${mins} min left (due ${task.dueTime})`;
          }
        } else {
          const dayTs = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            DATE_ONLY_HOUR,
            0,
            0,
            0,
          ).getTime();
          if (nowTs >= dayTs && nowTs <= dayTs + 60 * 60 * 1000) {
            phase = "day";
            body = isZh ? "今日到期（未设具体时间）" : "Due today (no specific time)";
          }
        }

        if (!phase) continue;
        const key = `${task.id}:${task.dueDate}:${task.dueTime || "day"}:${phase}`;
        notify(task, key, body);
      }
    };
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [isHydrated, locale, tasks, completedTasks, onOpenTask]);

  const active = new Set(tasks.map((task) => task.id));
  return { reminders: reminders.filter((item) => active.has(item.taskId)), dismiss, snooze };
}

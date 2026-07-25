import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getLocalDateString } from "../utils/date";
import type { Task } from "../types";

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

  useEffect(() => {
    if (!isHydrated) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const check = () => {
      try { getCurrentWebviewWindow(); } catch { return; }

      const enabledRaw = localStorage.getItem("tongyun_due_remind_enabled");
      if (enabledRaw === "0") return;
      const beforeMinRaw = parseInt(localStorage.getItem("tongyun_due_remind_before_min") || "15", 10);
      const beforeMin = [5, 15, 30, 60].includes(beforeMinRaw) ? beforeMinRaw : 15;
      const REMIND_BEFORE = beforeMin * 60 * 1000;
      const DATE_ONLY_HOUR = 9;

      const now = new Date();
      const todayStr = getLocalDateString(now);
      const nowTs = now.getTime();
      const isZh = locale === "zh-CN";
      const completedIds = new Set(completedTasks.map((c) => c.id));
      for (const task of tasks) {
        if (task.dueDate !== todayStr) continue;
        if (completedIds.has(task.id)) continue;

        let phase: "before" | "due" | "day" | null = null;
        let body = "";

        if (task.dueTime) {
          const [h, m] = task.dueTime.split(":").map(Number);
          if (Number.isNaN(h) || Number.isNaN(m)) continue;
          const dueTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).getTime();
          if (nowTs >= dueTs && nowTs <= dueTs + 60 * 60 * 1000) {
            phase = "due";
            body = isZh ? `已到截止时间 ${task.dueTime}` : `Due at ${task.dueTime}`;
          } else if (nowTs >= dueTs - REMIND_BEFORE && nowTs < dueTs) {
            phase = "before";
            const mins = Math.max(1, Math.round((dueTs - nowTs) / 60000));
            body = isZh
              ? (mins <= 1 ? `即将在 ${task.dueTime} 截止` : `还有 ${mins} 分钟（${task.dueTime}）截止`)
              : (mins <= 1 ? `Due at ${task.dueTime}` : `${mins} min left (due ${task.dueTime})`);
          }
        } else {
          const dayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DATE_ONLY_HOUR, 0, 0, 0).getTime();
          if (nowTs >= dayTs && nowTs <= dayTs + 60 * 60 * 1000) {
            phase = "day";
            body = isZh ? "今日到期（未设具体时间）" : "Due today (no specific time)";
          }
        }

        if (!phase) continue;
        const key = `${task.id}:${phase}`;
        if (notifiedDueRef.current.has(key)) continue;
        notifiedDueRef.current.add(key);
        try {
          const n = new Notification(isZh ? "⏰ 任务提醒" : "⏰ Task Reminder", {
            body: `${task.title}\n${body}`,
            tag: `tongyun-due-${task.id}-${phase}`,
            data: { taskId: task.id },
          });
          n.onclick = () => {
            onOpenTask(task.id);
            try { n.close(); } catch { /* ignore */ }
          };
        } catch { /* ignore */ }
      }
    };
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [isHydrated, locale, tasks, completedTasks, onOpenTask]);
}

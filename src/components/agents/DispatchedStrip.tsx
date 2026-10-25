import type { Task, TaskRunStatus } from "../../types";
import { useAgents } from "../../hooks/useAgents";
import { useTranslation } from "../../i18n/LanguageContext";
import { describeRunStatus } from "../../utils/workbenchView";

interface DispatchedStripProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onOpenAgent: () => void;
}

function statusText(
  status: TaskRunStatus | undefined,
  labels: { queued: string; running: string; done: string; failed: string },
): string {
  const key = describeRunStatus(status);
  return labels[key];
}

/** 我的侧的灰入口：一行一条，不占四象限卡片。 */
export function DispatchedStrip({ tasks, onTaskClick, onOpenAgent }: DispatchedStripProps) {
  const { t } = useTranslation();
  const ap = t.agentPanel;
  const { getAgentHandle } = useAgents();
  const labels = {
    queued: ap.queued,
    running: ap.running,
    done: ap.done,
    failed: ap.failed,
  };

  return (
    <section
      data-dispatched-strip
      className="shrink-0 rounded-2xl border border-[#E4E0D8] dark:border-[#2C2E34] bg-[#F3F0EA] dark:bg-[#1A1C20] px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 min-w-0">
          {ap.dispatchedTitle}
          <span className="ml-1.5 font-medium text-slate-400 dark:text-slate-500">
            {ap.dispatchedHint}
          </span>
        </p>
        <button
          type="button"
          onClick={onOpenAgent}
          className="shrink-0 text-[10px] font-bold text-[#4D7C5D] dark:text-[#6FAD84] cursor-pointer hover:underline"
        >
          {ap.viewInAgent}
        </button>
      </div>
      <ul className="flex flex-col gap-1 max-h-28 overflow-y-auto custom-scrollbar">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              data-dispatched-entry={task.id}
              onClick={() => onTaskClick(task)}
              className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1 text-[11px] text-slate-500 dark:text-slate-400 bg-[#E9E6E0]/90 dark:bg-[#24262B] hover:bg-[#E2DED6] dark:hover:bg-[#2C2E34] cursor-pointer"
            >
              <span className="truncate flex-1 font-semibold">{task.title}</span>
              <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                {getAgentHandle(task.assigneeAgentId) || ap.unassigned} ·{" "}
                {statusText(task.runStatus, labels)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

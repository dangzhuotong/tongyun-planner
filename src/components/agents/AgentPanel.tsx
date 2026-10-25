import { useMemo, useState } from "react";
import { Bot } from "lucide-react";
import type { Task, TaskRunStatus } from "../../types";
import { useAgents } from "../../hooks/useAgents";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  describeRunStatus,
  partitionAgentBoard,
  runActionsFor,
  type AgentColumnId,
} from "../../utils/workbenchView";

interface AgentPanelProps {
  tasks: Task[];
  onEditTask: (id: string, updates: Partial<Task>) => void;
  onTaskClick: (task: Task) => void;
  onOpenSettings: () => void;
}

export function AgentPanel({ tasks, onEditTask, onTaskClick, onOpenSettings }: AgentPanelProps) {
  const { t } = useTranslation();
  const ap = t.agentPanel;
  const { agents, getAgentHandle } = useAgents();
  const [agentFilter, setAgentFilter] = useState("all");

  const board = useMemo(
    () => partitionAgentBoard(tasks, agentFilter === "all" ? undefined : agentFilter),
    [tasks, agentFilter],
  );

  const columns: { id: AgentColumnId; title: string; hint: string; items: Task[] }[] = [
    { id: "queued", title: ap.queued, hint: ap.queuedHint, items: board.queued },
    { id: "running", title: ap.running, hint: ap.runningHint, items: board.running },
    { id: "settled", title: ap.settled, hint: ap.settledHint, items: board.settled },
  ];

  const actionLabel = (action: TaskRunStatus): string => {
    if (action === "running") return ap.start;
    if (action === "done") return ap.markDone;
    if (action === "failed") return ap.markFailed;
    return ap.requeue;
  };

  const applyStatus = (task: Task, status: TaskRunStatus) => {
    const fromSettled = task.runStatus === "done" || task.runStatus === "failed";
    if (status === "queued" && fromSettled) {
      onEditTask(task.id, {
        assigneeKind: "agent",
        assigneeAgentId: task.assigneeAgentId,
        runStatus: "queued",
      });
      return;
    }
    onEditTask(task.id, { runStatus: status });
  };

  const total = board.queued.length + board.running.length + board.settled.length;

  return (
    <section data-agent-panel className="flex flex-col gap-4 min-h-0 flex-grow">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#EFEBE4] dark:border-[#33353A] pb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-wide text-[#2D323A] dark:text-slate-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#8B6E3C] dark:text-[#E2C799]" />
            {ap.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{ap.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span className="sr-only">{ap.filterAll}</span>
            <select
              data-agent-filter
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
              className="bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#383A42] rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">{ap.filterAll}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.handle}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] text-slate-500 dark:text-slate-300 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] cursor-pointer"
          >
            {ap.openSettings}
          </button>
        </div>
      </header>

      {total === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-[#1C1D21] border border-dashed border-[#E4E0D8] dark:border-[#33353A] rounded-2xl px-4 py-6 text-center">
          {ap.emptyBoard}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-0 flex-grow">
        {columns.map((column) => (
          <div
            key={column.id}
            data-agent-column={column.id}
            className="rounded-2xl border border-[#EFEBE4] dark:border-[#33353A] bg-[#F7F4EF]/80 dark:bg-[#181A1E] p-3 flex flex-col gap-2 min-h-[180px]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-[#2D323A] dark:text-slate-100">
                {column.title}
              </h3>
              <span className="text-[10px] font-bold text-slate-400">{column.items.length}</span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{column.hint}</p>
            {column.items.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 py-6 text-center">
                {ap.emptyColumn}
              </p>
            ) : (
              <ul className="flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                {column.items.map((task) => (
                  <li
                    key={task.id}
                    data-agent-card={task.id}
                    data-run-status={task.runStatus || "queued"}
                    className={`rounded-xl border bg-white/95 dark:bg-[#1C1D21] p-3 flex flex-col gap-2 ${
                      task.runStatus === "failed"
                        ? "border-[#F5DFDB] dark:border-[#422D30]"
                        : task.runStatus === "done"
                          ? "border-[#DEEAE2] dark:border-[#38433B]"
                          : "border-[#EFEBE4] dark:border-[#33353A]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onTaskClick(task)}
                      className="text-left text-xs font-bold text-[#2D323A] dark:text-slate-100 truncate hover:underline cursor-pointer"
                    >
                      {task.title}
                    </button>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {getAgentHandle(task.assigneeAgentId) || ap.unassigned} ·{" "}
                      {ap[describeRunStatus(task.runStatus)]}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {runActionsFor(task.runStatus).map((action) => (
                        <button
                          key={action}
                          type="button"
                          data-run-action={action}
                          onClick={() => applyStatus(task, action)}
                          className="px-2 py-1 rounded-md text-[10px] font-bold border border-[#E7E1D8] dark:border-[#383A42] bg-[#FAF8F5] dark:bg-[#26282E] text-slate-600 dark:text-slate-200 hover:border-[#4D7C5D] cursor-pointer"
                        >
                          {actionLabel(action)}
                        </button>
                      ))}
                      <button
                        type="button"
                        data-run-action="human"
                        onClick={() =>
                          onEditTask(task.id, {
                            assigneeKind: "human",
                            assigneeAgentId: undefined,
                            runStatus: undefined,
                          })
                        }
                        className="px-2 py-1 rounded-md text-[10px] font-bold border border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {ap.backToMe}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

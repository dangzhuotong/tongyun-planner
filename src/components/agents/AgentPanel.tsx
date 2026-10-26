import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Plus, X } from "lucide-react";
import type { Task, TaskRunStatus } from "../../types";
import { useAgents } from "../../hooks/useAgents";
import { useTranslation } from "../../i18n/LanguageContext";
import { getLocalDateString } from "../../utils/date";
import { createId } from "../../utils/id";
import { formatRosterOption } from "../../utils/pipeline/companyRoster";
import {
  alignTaskWithPipeline,
  companyRosterSlug,
  resolveCompanyAssigneeId,
  type PipelineTaskReceipt,
} from "../../utils/pipeline/pipelineTasks";
import { CompanyRosterStrip } from "./CompanyRosterStrip";
import { RequirementComposer } from "./RequirementComposer";
import {
  describeRunStatus,
  partitionAgentBoard,
  LAST_DISPATCHED_AGENT_KEY,
  runActionsFor,
  type AgentColumnId,
} from "../../utils/workbenchView";

function withStamp(updates: Partial<Task>): Partial<Task> {
  return { ...updates, updatedAt: Date.now() };
}

interface AgentPanelProps {
  tasks: Task[];
  onAddTask?: (taskData: {
    title: string;
    description?: string;
    notes?: string;
    category?: Task["category"];
    dueDate?: string;
    dueTime?: string;
    priority?: Task["priority"];
    assigneeKind?: Task["assigneeKind"];
    assigneeAgentId?: Task["assigneeAgentId"];
    runStatus?: Task["runStatus"];
    pipelineTaskId?: Task["pipelineTaskId"];
    id?: string;
    isExplicit?: boolean;
  }) => void | Promise<any>;
  onEditTask: (id: string, updates: Partial<Task>) => void;
  onTaskClick: (task: Task) => void;
  onOpenSettings: () => void;
}

export function AgentPanel({
  tasks,
  onAddTask,
  onEditTask,
  onTaskClick,
  onOpenSettings,
}: AgentPanelProps) {
  const { t, locale } = useTranslation();
  const ap = t.agentPanel;
  const {
    agents,
    roster,
    rosterVia,
    rosterError,
    loading,
    refreshRoster,
    getAgentHandle,
    submitRequirement,
    publishPipelineTask,
    reassignPipelineTask,
    settlePipelineTask,
    pullPipelineTasks,
  } = useAgents();
  const [agentFilter, setAgentFilter] = useState("all");
  const [isCreating, setIsCreating] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedAgentIdOverride, setSelectedAgentIdOverride] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const storedAgentId = useMemo(() => {
    try {
      return typeof localStorage !== "undefined"
        ? localStorage.getItem(LAST_DISPATCHED_AGENT_KEY)
        : null;
    } catch {
      return null;
    }
  }, []);

  const companyAgents = useMemo(
    () =>
      agents.filter((agent) =>
        roster.some(
          (entry) => entry.source === "company" && entry.enabled && entry.id === agent.id,
        ),
      ),
    [agents, roster],
  );

  const selectedAgentId = useMemo(() => {
    return resolveCompanyAssigneeId(
      companyAgents,
      selectedAgentIdOverride || (agentFilter !== "all" ? agentFilter : storedAgentId),
    );
  }, [companyAgents, selectedAgentIdOverride, agentFilter, storedAgentId]);

  const pipelineKey = useMemo(
    () =>
      tasks
        .map((task) => task.pipelineTaskId)
        .filter((id): id is string => Boolean(id))
        .sort()
        .join(","),
    [tasks],
  );

  useEffect(() => {
    if (!pipelineKey) return;
    let alive = true;
    const sync = () => {
      pullPipelineTasks(pipelineKey.split(","))
        .then((rows) => {
          if (!alive) return;
          setSyncError(null);
          for (const row of rows) {
            const current = tasksRef.current.find((item) => item.pipelineTaskId === row.id);
            if (!current) continue;
            const updates = alignTaskWithPipeline(current, row);
            if (updates) onEditTask(current.id, updates);
          }
        })
        .catch((error: unknown) => {
          if (!alive) return;
          setSyncError(error instanceof Error ? error.message : ap.syncFailed);
        });
    };
    sync();
    const timer = window.setInterval(sync, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pipelineKey, pullPipelineTasks, onEditTask, ap.syncFailed]);

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

  const describeReceipt = (
    receipt: PipelineTaskReceipt & { persisted: "pipeline" | "fixture" },
  ) => {
    if (receipt.persisted === "fixture") return `${ap.startFixture} ${receipt.id}`;
    if (!receipt.written && receipt.runStatus === "running") {
      return `${ap.startAligned} ${receipt.id} · ${receipt.status}`;
    }
    return `${ap.startSaved} ${receipt.id} · ${receipt.status}`;
  };

  const rememberAgent = (agentId: string) => {
    try {
      localStorage.setItem(LAST_DISPATCHED_AGENT_KEY, agentId);
    } catch {
      /* ignore */
    }
  };

  const applyStatus = async (task: Task, status: TaskRunStatus) => {
    if (pendingId) return;
    setActionError(null);
    setActionNotice(null);

    if (status === "running") {
      const slug = companyRosterSlug(roster, task.assigneeAgentId);
      if (!slug) {
        setActionError(ap.startNeedsAssignee);
        return;
      }
      setPendingId(task.id);
      try {
        const receipt = await publishPipelineTask({
          plannerTaskId: task.id,
          pipelineTaskId: task.pipelineTaskId,
          title: task.title,
          detail: task.description || task.notes,
          assignee: slug,
        });
        onEditTask(
          task.id,
          withStamp({
            assigneeKind: "agent",
            assigneeAgentId: receipt.assignee || slug,
            runStatus: receipt.runStatus,
            pipelineTaskId: receipt.id,
          }),
        );
        setActionNotice(describeReceipt(receipt));
      } catch (error) {
        setActionError(error instanceof Error ? error.message : ap.startFailed);
      } finally {
        setPendingId(null);
      }
      return;
    }

    if (task.pipelineTaskId) {
      setPendingId(task.id);
      try {
        const receipt = await settlePipelineTask({
          plannerTaskId: task.id,
          pipelineTaskId: task.pipelineTaskId,
          title: task.title,
          assignee: task.assigneeAgentId,
          settleAs: status,
        });
        onEditTask(
          task.id,
          withStamp({
            assigneeKind: "agent",
            assigneeAgentId: receipt.assignee || task.assigneeAgentId,
            runStatus: receipt.runStatus,
            pipelineTaskId: receipt.id,
          }),
        );
        setActionNotice(`${ap.settleSaved} ${receipt.id} · ${receipt.status}`);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : ap.settleFailed);
      } finally {
        setPendingId(null);
      }
      return;
    }

    onEditTask(
      task.id,
      withStamp({
        assigneeKind: "agent",
        assigneeAgentId: task.assigneeAgentId,
        runStatus: status,
      }),
    );
  };

  const reassign = async (task: Task, assigneeId: string) => {
    if (pendingId) return;
    const slug = companyRosterSlug(roster, assigneeId);
    setActionError(null);
    setActionNotice(null);
    if (!slug) {
      setActionError(ap.startNeedsAssignee);
      return;
    }
    setPendingId(task.id);
    try {
      const receipt = await reassignPipelineTask({
        plannerTaskId: task.id,
        pipelineTaskId: task.pipelineTaskId,
        title: task.title,
        detail: task.description || task.notes,
        assignee: slug,
      });
      onEditTask(
        task.id,
        withStamp({
          assigneeKind: "agent",
          assigneeAgentId: receipt.assignee || slug,
          runStatus: receipt.runStatus,
          pipelineTaskId: receipt.id,
        }),
      );
      rememberAgent(receipt.assignee || slug);
      setActionNotice(
        receipt.persisted === "fixture"
          ? `${ap.startFixture} ${receipt.id} · ${receipt.assignee}`
          : `${ap.reassignSaved} ${receipt.id} · ${receipt.assignee}`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ap.reassignFailed);
    } finally {
      setPendingId(null);
    }
  };

  const returnToMe = async (task: Task) => {
    if (pendingId) return;
    setActionError(null);
    setActionNotice(null);
    if (task.pipelineTaskId) {
      setPendingId(task.id);
      try {
        await settlePipelineTask({
          plannerTaskId: task.id,
          pipelineTaskId: task.pipelineTaskId,
          title: task.title,
          assignee: task.assigneeAgentId,
          settleAs: "cancelled",
        });
      } catch (error) {
        setActionError(error instanceof Error ? error.message : ap.releaseFailed);
        setPendingId(null);
        return;
      }
      setPendingId(null);
    }
    onEditTask(
      task.id,
      withStamp({
        assigneeKind: "human",
        assigneeAgentId: undefined,
        runStatus: undefined,
        pipelineTaskId: undefined,
      }),
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    const slug = companyRosterSlug(roster, selectedAgentId);
    setActionError(null);
    setActionNotice(null);
    if (!trimmed) return;
    if (!slug) {
      setActionError(ap.startNeedsRoster);
      return;
    }
    if (pendingId) return;

    const plannerTaskId = createId("task");
    setPendingId("create");
    try {
      const receipt = await publishPipelineTask({
        plannerTaskId,
        title: trimmed,
        assignee: slug,
      });
      rememberAgent(receipt.assignee || slug);
      await onAddTask?.({
        id: plannerTaskId,
        title: trimmed,
        description: "",
        notes: "",
        category: "important-not-urgent",
        dueDate: getLocalDateString(),
        assigneeKind: "agent",
        assigneeAgentId: receipt.assignee || slug,
        runStatus: receipt.runStatus,
        pipelineTaskId: receipt.id,
        isExplicit: true,
      });
      setActionNotice(describeReceipt(receipt));
      setNewTitle("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ap.startFailed);
    } finally {
      setPendingId(null);
    }
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
          <button
            type="button"
            data-agent-new-task
            onClick={() => setIsCreating((prev) => !prev)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#4D7C5D] text-white hover:bg-[#3F684C] cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {ap.newTask || "新建"}
          </button>
          <button
            type="button"
            data-requirement-open
            onClick={() => setIsRequesting((prev) => !prev)}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] text-slate-600 dark:text-slate-200 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] cursor-pointer"
          >
            {ap.requirementOpen}
          </button>
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
                  {formatRosterOption(agent, { locale, style: "filter", withHeartbeat: true })}
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

      <CompanyRosterStrip
        entries={roster}
        via={rosterVia}
        error={rosterError}
        loading={loading}
        onRefresh={() => {
          refreshRoster().catch((error) => console.error("Failed to refresh roster", error));
        }}
      />

      {isRequesting && <RequirementComposer onSubmit={submitRequirement} />}

      {actionError && (
        <p
          data-pipeline-error
          className="text-[11px] font-bold text-[#B83E26] dark:text-[#E67058] bg-[#FDF6F4] dark:bg-[#2A1E1C] border border-[#F5DFDB] dark:border-[#422D30] rounded-xl px-3 py-2"
        >
          {actionError}
        </p>
      )}
      {actionNotice && (
        <p
          data-pipeline-notice
          className="text-[11px] font-bold text-[#2F6B42] dark:text-[#78C496] bg-[#F4F8F5] dark:bg-[#1C2620] border border-[#DEEAE2] dark:border-[#38433B] rounded-xl px-3 py-2"
        >
          {actionNotice}
        </p>
      )}
      {syncError && (
        <p data-pipeline-sync-error className="text-[11px] text-[#A26D14] dark:text-[#E8BA60]">
          {syncError}
        </p>
      )}

      {/* New Task Dispatch Bar */}
      {isCreating && (
        <form
          data-agent-quick-add
          onSubmit={handleCreateSubmit}
          className="flex flex-wrap items-center gap-2.5 bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#33353A] rounded-2xl p-3 shadow-xs animate-fade-in-up"
        >
          <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4]/80 dark:border-[#383A42] px-3 py-1.5 rounded-xl focus-within:border-[#4D7C5D] dark:focus-within:border-[#6FAD84]">
            <Plus className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <input
              type="text"
              data-agent-title-input
              placeholder={ap.quickAddPlaceholder || "输入派活标题，回车保存..."}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsCreating(false);
                  setNewTitle("");
                }
              }}
              autoFocus
              className="w-full bg-transparent border-none text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-medium"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1">
              <Bot className="w-3.5 h-3.5 text-[#A26D14] dark:text-[#E8BA60]" />
              Agent
            </span>
            <select
              data-agent-select
              value={selectedAgentId}
              onChange={(e) => {
                setSelectedAgentIdOverride(e.target.value);
                try {
                  localStorage.setItem(LAST_DISPATCHED_AGENT_KEY, e.target.value);
                } catch {
                  /* ignore */
                }
              }}
              className="bg-[#FAF8F5] dark:bg-[#282A30] border border-[#EFEBE4] dark:border-[#383A42] rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#4D7C5D] cursor-pointer"
            >
              {companyAgents.length === 0 ? (
                <option value="" disabled>
                  {ap.startNeedsRoster}
                </option>
              ) : (
                companyAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {formatRosterOption(agent, {
                      locale,
                      style: "assignee",
                      withHeartbeat: true,
                    })}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setNewTitle("");
              }}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              {t.common.cancel}
            </button>
            <button
              type="submit"
              data-agent-submit-btn
              disabled={!newTitle.trim() || !selectedAgentId || pendingId === "create"}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-[#4D7C5D] text-white hover:bg-[#3F684C] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-xs"
            >
              {ap.dispatchSave || "保存"}
            </button>
          </div>
        </form>
      )}

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
                    data-pipeline-task={task.pipelineTaskId || ""}
                    className={`rounded-xl border bg-white/95 dark:bg-[#1C1D21] p-3 flex flex-col gap-2 ${
                      task.runStatus === "failed"
                        ? "border-[#F5DFDB] dark:border-[#422D30]"
                        : task.runStatus === "blocked"
                          ? "border-[#FBE6C2] dark:border-[#523F1E]"
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
                      {task.runStatus === "blocked"
                        ? ap.blocked || "阻塞"
                        : ap[describeRunStatus(task.runStatus)]}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <select
                        data-agent-reassign={task.id}
                        value={
                          companyAgents.some((agent) => agent.id === task.assigneeAgentId)
                            ? task.assigneeAgentId
                            : ""
                        }
                        disabled={pendingId === task.id || companyAgents.length === 0}
                        onChange={(event) => {
                          void reassign(task, event.target.value);
                        }}
                        className="max-w-[9rem] bg-[#FAF8F5] dark:bg-[#282A30] border border-[#E7E1D8] dark:border-[#383A42] rounded-md px-1.5 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="" disabled>
                          {ap.reassignPlaceholder}
                        </option>
                        {companyAgents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {formatRosterOption(agent, { locale, style: "assignee" })}
                          </option>
                        ))}
                      </select>
                      {runActionsFor(task.runStatus).map((action) => (
                        <button
                          key={action}
                          type="button"
                          data-run-action={action}
                          disabled={pendingId === task.id}
                          onClick={() => {
                            void applyStatus(task, action);
                          }}
                          className="px-2 py-1 rounded-md text-[10px] font-bold border border-[#E7E1D8] dark:border-[#383A42] bg-[#FAF8F5] dark:bg-[#282A30] text-slate-600 dark:text-slate-200 hover:border-[#4D7C5D] cursor-pointer disabled:opacity-50"
                        >
                          {actionLabel(action)}
                        </button>
                      ))}
                      <button
                        type="button"
                        data-run-action="human"
                        disabled={pendingId === task.id}
                        onClick={() => {
                          void returnToMe(task);
                        }}
                        className="px-2 py-1 rounded-md text-[10px] font-bold border border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
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

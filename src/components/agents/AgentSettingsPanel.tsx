import React, { useState, useCallback } from "react";
import { Bot, Plus, Trash2, Edit2, Check, X, CheckCircle, AlertCircle, Power } from "lucide-react";
import type { AgentKind, DomainAgent, Task } from "../../types";
import { useAgents, getRunStatusLabel } from "../../hooks/useAgents";
import { createId } from "../../utils/id";

interface AgentSettingsPanelProps {
  tasks?: Task[];
  onEditTask?: (id: string, updates: Partial<Task>) => void;
  triggerToast?: (text: string, type: "success" | "error") => void;
}

const KIND_LABELS: Record<AgentKind, { label: string; desc: string }> = {
  manual: {
    label: "手工推进 (Manual)",
    desc: "由人在界面中手工推进或标记已跑，无需外部 Runner。",
  },
  local_runner: {
    label: "本地 Runner",
    desc: "由本地守护进程或 CLI 自动拾取 queued 任务执行。",
  },
  pipeline_bridge: {
    label: "公司任务池网关",
    desc: "将选定任务桥接到 tongyun_pipeline 统一任务池。",
  },
};

export const AgentSettingsPanel: React.FC<AgentSettingsPanelProps> = ({
  tasks = [],
  onEditTask,
  triggerToast,
}) => {
  const { agents, saveAgent, deleteAgent, toggleAgent } = useAgents();

  // Form states for new agent
  const [newHandle, setNewHandle] = useState("");
  const [newKind, setNewKind] = useState<AgentKind>("manual");
  const [formError, setFormError] = useState<string | null>(null);

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHandle, setEditHandle] = useState("");
  const [editKind, setEditKind] = useState<AgentKind>("manual");

  const handleAddAgent = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const handle = newHandle.trim();
      if (!handle) {
        setFormError("Agent 展示名 (handle) 不能为空");
        return;
      }
      if (agents.some((a) => a.handle.toLowerCase() === handle.toLowerCase())) {
        setFormError(`展示名「${handle}」已存在，请换一个全局唯一名称`);
        return;
      }

      try {
        const agent: DomainAgent = {
          id: createId("agent"),
          handle,
          kind: newKind,
          enabled: true,
          meta: {},
          updatedAt: Date.now(),
        };
        await saveAgent(agent);
        setNewHandle("");
        setNewKind("manual");
        setFormError(null);
        triggerToast?.(`成功登记 Agent「${handle}」`, "success");
      } catch {
        setFormError("登记 Agent 失败，请检查数据库权限或格式");
      }
    },
    [newHandle, newKind, agents, saveAgent, triggerToast],
  );

  const startEdit = useCallback((agent: DomainAgent) => {
    setEditingId(agent.id);
    setEditHandle(agent.handle);
    setEditKind(agent.kind);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditHandle("");
  }, []);

  const handleSaveEdit = useCallback(
    async (agent: DomainAgent) => {
      const handle = editHandle.trim();
      if (!handle) return;
      if (
        agents.some((a) => a.id !== agent.id && a.handle.toLowerCase() === handle.toLowerCase())
      ) {
        triggerToast?.(`展示名「${handle}」已被其他 Agent 使用`, "error");
        return;
      }

      const updated: DomainAgent = {
        ...agent,
        handle,
        kind: editKind,
        updatedAt: Date.now(),
      };
      await saveAgent(updated);
      setEditingId(null);
      triggerToast?.(`Agent「${handle}」修改成功`, "success");
    },
    [editHandle, editKind, agents, saveAgent, triggerToast],
  );

  const handleDelete = useCallback(
    async (id: string, handle: string) => {
      if (agents.length <= 1) {
        triggerToast?.("至少保留一个 Agent", "error");
        return;
      }
      await deleteAgent(id);
      triggerToast?.(`已删除 Agent「${handle}」`, "success");
    },
    [agents.length, deleteAgent, triggerToast],
  );

  // Find active dispatched tasks
  const activeDispatchedTasks = tasks.filter(
    (t) =>
      t.assigneeKind === "agent" &&
      t.assigneeAgentId &&
      (t.runStatus === "queued" || t.runStatus === "running"),
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#8B6E3C] dark:text-[#CBB182]" />
          <span>AI 助手登记与协同 (Domain Agents)</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          在此登记可在四象限/列表手帐任务中指派的 AI Agent。数据持久化落入本机 SQLite
          (domain_agents)。禁用后该 Agent 不可新派。
        </p>
      </div>

      {/* Add New Agent Form */}
      <form
        onSubmit={handleAddAgent}
        className="p-4 rounded-xl border border-[#EFEBE4] dark:border-[#2E313A] bg-[#FAF8F5] dark:bg-[#1C1E24] space-y-3"
      >
        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">登记新 Agent</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              展示名 (handle，唯一)
            </label>
            <input
              type="text"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="如 本地助手 / agy-ibz"
              className="w-full px-3 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#8B6E3C]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              类型 (Kind)
            </label>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as AgentKind)}
              className="w-full px-3 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#8B6E3C]"
            >
              <option value="manual">{KIND_LABELS.manual.label}</option>
              <option value="local_runner">{KIND_LABELS.local_runner.label}</option>
              <option value="pipeline_bridge">{KIND_LABELS.pipeline_bridge.label}</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#4D7C5D] hover:bg-[#3F684C] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>登记 Agent</span>
            </button>
          </div>
        </div>

        {formError && (
          <div className="text-[11px] text-red-500 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{formError}</span>
          </div>
        )}
      </form>

      {/* Agent List */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
          已登记的 Agent 列表 ({agents.length})
        </div>

        <div className="divide-y divide-[#EFEBE4] dark:divide-[#2E313A] rounded-xl border border-[#EFEBE4] dark:border-[#2E313A] bg-white dark:bg-[#1C1E24] overflow-hidden">
          {agents.map((agent) => {
            const isEditing = editingId === agent.id;
            return (
              <div
                key={agent.id}
                className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAF8F5]/60 dark:hover:bg-[#26282E]/40 transition-colors"
              >
                {isEditing ? (
                  <div className="flex-grow flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={editHandle}
                      onChange={(e) => setEditHandle(e.target.value)}
                      className="px-2.5 py-1 rounded-md border border-[#8B6E3C] bg-white dark:bg-[#26282E] text-xs font-bold text-slate-800 dark:text-slate-100"
                    />
                    <select
                      value={editKind}
                      onChange={(e) => setEditKind(e.target.value as AgentKind)}
                      className="px-2 py-1 rounded-md border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-xs"
                    >
                      <option value="manual">{KIND_LABELS.manual.label}</option>
                      <option value="local_runner">{KIND_LABELS.local_runner.label}</option>
                      <option value="pipeline_bridge">{KIND_LABELS.pipeline_bridge.label}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(agent)}
                      className="p-1 rounded bg-[#EAF5ED] text-[#2F6B42] hover:bg-[#DDF0E2] cursor-pointer"
                      title="保存修改"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer"
                      title="取消"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        agent.enabled
                          ? "bg-[#FAF5ED] dark:bg-[#2E281F] text-[#8B6E3C] dark:text-[#CBB182]"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                      }`}
                    >
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {agent.handle}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md border border-[#EFEBE4] dark:border-[#33353A] text-slate-500 dark:text-slate-400 bg-[#FAF8F5] dark:bg-[#26282E]">
                          {KIND_LABELS[agent.kind]?.label || agent.kind}
                        </span>
                        {!agent.enabled && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">
                            已禁用（不可新派）
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                        {KIND_LABELS[agent.kind]?.desc}
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-colors cursor-pointer ${
                      agent.enabled
                        ? "bg-[#F0F5F1] dark:bg-[#1E2820] text-[#4D7C5D] dark:text-[#78C496] border-[#DEEAE2] dark:border-[#2B3E32]"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                    }`}
                    title={agent.enabled ? "点击禁用（禁用后不可在新任务中指派）" : "点击启用"}
                  >
                    <Power className="w-3 h-3" />
                    <span>{agent.enabled ? "已启用" : "已禁用"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startEdit(agent)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#282A30] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="编辑名称与类型"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(agent.id, agent.handle)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                    title="删除 Agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Manual Dispatches / 手动推进中心 */}
      <div className="p-4 rounded-xl border border-[#EFEBE4] dark:border-[#2E313A] bg-[#FAF8F5] dark:bg-[#1C1E24] space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-[#4D7C5D]" />
            <span>手动推进中心（已派发待执行任务）</span>
          </div>
          <span className="text-[10px] text-slate-400">
            {activeDispatchedTasks.length} 个任务待处理
          </span>
        </div>

        {activeDispatchedTasks.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
            暂无排队中的 AI 任务。可在四象限或列表新建任务，指派负责人为某 AI
            后在此或在卡片上手工推进。
          </div>
        ) : (
          <div className="divide-y divide-[#EFEBE4] dark:divide-[#2E313A] bg-white dark:bg-[#26282E] rounded-lg border border-[#EFEBE4] dark:border-[#33353A] overflow-hidden">
            {activeDispatchedTasks.map((t) => {
              const agent = agents.find((a) => a.id === t.assigneeAgentId);
              return (
                <div key={t.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {t.title}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-[#FEF9EE] dark:bg-[#322A1E] text-[#A26D14] dark:text-[#E8BA60] border border-[#FBEAC4] dark:border-[#4B3C24]">
                        {getRunStatusLabel(t.runStatus)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      指派 Agent: {agent ? agent.handle : t.assigneeAgentId}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditTask?.(t.id, { runStatus: "done" })}
                      className="px-2.5 py-1 rounded bg-[#EAF5ED] dark:bg-[#1E2E23] text-[#2F6B42] dark:text-[#78C496] border border-[#CDE5D4] dark:border-[#2B4232] hover:bg-[#DDF0E2] text-xs font-bold cursor-pointer transition-colors"
                    >
                      标记已跑
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditTask?.(t.id, { runStatus: "failed" })}
                      className="px-2.5 py-1 rounded bg-[#FCF2F0] dark:bg-[#382224] text-[#B83E26] dark:text-[#E67058] border border-[#F5DFDB] dark:border-[#4D2B2E] hover:bg-[#F9E5E2] text-xs font-bold cursor-pointer transition-colors"
                    >
                      标记失败
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onEditTask?.(t.id, {
                          assigneeKind: "human",
                          assigneeAgentId: undefined,
                          runStatus: undefined,
                        })
                      }
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer transition-colors"
                      title="取消派单并改回自己"
                    >
                      改回自己
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

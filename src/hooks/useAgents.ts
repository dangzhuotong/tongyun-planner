import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DomainAgent, TaskRunStatus } from "../types";
import { agentRepository } from "../data/repositories";
import { storage } from "../utils/unifiedStorage";
import {
  type CompanyRosterEntry,
  type RequirementDraft,
  type RosterVia,
  localAgentsToRoster,
  rosterEntryToDomainAgent,
} from "../utils/pipeline/companyRoster";
import {
  fetchCompanyRoster,
  publishPlannerPipelineTask,
  pullPlannerPipelineTasks,
  submitPlannerRequirement,
} from "../utils/pipeline/pipelineGateway";
import { companyRosterSlug, type PipelineTaskDraft } from "../utils/pipeline/pipelineTasks";

export function getRunStatusLabel(status?: TaskRunStatus): string {
  switch (status) {
    case "queued":
      return "待跑";
    case "running":
      return "运行中";
    case "done":
      return "已跑";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "blocked":
      return "阻塞";
    default:
      return "";
  }
}

export function useAgents() {
  const [localAgents, setLocalAgents] = useState<DomainAgent[]>([]);
  const [roster, setRoster] = useState<CompanyRosterEntry[]>([]);
  const [rosterVia, setRosterVia] = useState<RosterVia>("local");
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [dsnConfigured, setDsnConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const viaRef = useRef<RosterVia>("local");

  const applyRoster = useCallback(async (force: boolean) => {
    const local = await agentRepository.load().catch(() => [] as DomainAgent[]);
    setLocalAgents(local);
    const snap = await fetchCompanyRoster({ loadLocal: async () => local, force });
    viaRef.current = snap.via;
    setRoster(snap.entries);
    setRosterVia(snap.via);
    setRosterError(snap.error ?? null);
    setDsnConfigured(snap.dsnConfigured);
    setLoading(false);
  }, []);

  const refreshRoster = useCallback(() => applyRoster(true), [applyRoster]);

  const reloadLocal = useCallback(async () => {
    const local = await agentRepository.load();
    setLocalAgents(local);
    if (viaRef.current === "local") {
      setRoster(localAgentsToRoster(local));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // 等 SQLite 把 tongyun_remote_dsn / tongyun_sync_backend 写回 localStorage，
    // 否则第一次读会落在本机 domain_agents（本地助手/阿码），保存时没有公司工人可选。
    storage
      .init()
      .catch(() => undefined)
      .then(() => {
        if (!mounted) return;
        return applyRoster(true);
      })
      .catch((error) => {
        console.error("Failed to load company roster", error);
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [applyRoster]);

  const agents = useMemo(() => roster.map(rosterEntryToDomainAgent), [roster]);
  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);

  const saveAgent = useCallback(
    async (agent: DomainAgent) => {
      await agentRepository.save(agent);
      await reloadLocal();
    },
    [reloadLocal],
  );

  const deleteAgent = useCallback(
    async (id: string) => {
      await agentRepository.delete(id);
      await reloadLocal();
    },
    [reloadLocal],
  );

  const toggleAgent = useCallback(
    async (id: string) => {
      const target = localAgents.find((agent) => agent.id === id);
      if (!target) return;
      const updated: DomainAgent = {
        ...target,
        enabled: !target.enabled,
        updatedAt: Date.now(),
      };
      await agentRepository.save(updated);
      await reloadLocal();
    },
    [localAgents, reloadLocal],
  );

  const getAgentHandle = useCallback(
    (id?: string) => {
      if (!id) return "";
      const fromRoster = roster.find((entry) => entry.id === id || entry.slug === id);
      if (fromRoster) return fromRoster.handle;
      const local = localAgents.find((agent) => agent.id === id);
      return local ? local.handle : id;
    },
    [roster, localAgents],
  );

  const submitRequirement = useCallback(async (draft: RequirementDraft) => {
    return submitPlannerRequirement(draft);
  }, []);

  const slugOrThrow = useCallback(
    (assignee?: string) => {
      const slug = companyRosterSlug(roster, assignee);
      if (!slug) throw new Error("工人没有心跳或不在可派名单里，任务未写入");
      return slug;
    },
    [roster],
  );

  const publishPipelineTask = useCallback(
    async (draft: Omit<PipelineTaskDraft, "intent" | "assignee"> & { assignee?: string }) => {
      const assignee = slugOrThrow(draft.assignee);
      return publishPlannerPipelineTask({ ...draft, assignee, intent: "start" });
    },
    [slugOrThrow],
  );

  const reassignPipelineTask = useCallback(
    async (draft: Omit<PipelineTaskDraft, "intent" | "assignee"> & { assignee?: string }) => {
      const assignee = slugOrThrow(draft.assignee);
      return publishPlannerPipelineTask({ ...draft, assignee, intent: "reassign" });
    },
    [slugOrThrow],
  );

  const settlePipelineTask = useCallback(
    async (draft: Omit<PipelineTaskDraft, "intent"> & { settleAs: TaskRunStatus }) => {
      return publishPlannerPipelineTask({ ...draft, intent: "settle" });
    },
    [],
  );

  const pullPipelineTasks = useCallback(async (ids: string[]) => {
    return pullPlannerPipelineTasks(ids);
  }, []);

  return {
    agents,
    enabledAgents,
    localAgents,
    roster,
    rosterVia,
    rosterError,
    dsnConfigured,
    loading,
    saveAgent,
    deleteAgent,
    toggleAgent,
    refreshAgents: refreshRoster,
    refreshRoster,
    getAgentHandle,
    submitRequirement,
    publishPipelineTask,
    reassignPipelineTask,
    settlePipelineTask,
    pullPipelineTasks,
  };
}

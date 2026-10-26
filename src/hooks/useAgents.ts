import { useState, useEffect, useCallback, useMemo } from "react";
import type { DomainAgent, TaskRunStatus } from "../types";
import { agentRepository } from "../data/repositories";

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
  const [agents, setAgents] = useState<DomainAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAgents = useCallback(async () => {
    try {
      const loaded = await agentRepository.load();
      setAgents(loaded);
    } catch (e) {
      console.error("Failed to load agents", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    agentRepository
      .load()
      .then((loaded) => {
        if (mounted) {
          setAgents(loaded);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("Failed to load agents in effect", e);
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const enabledAgents = useMemo(() => agents.filter((a) => a.enabled), [agents]);

  const saveAgent = useCallback(
    async (agent: DomainAgent) => {
      await agentRepository.save(agent);
      await refreshAgents();
    },
    [refreshAgents],
  );

  const deleteAgent = useCallback(
    async (id: string) => {
      await agentRepository.delete(id);
      await refreshAgents();
    },
    [refreshAgents],
  );

  const toggleAgent = useCallback(
    async (id: string) => {
      const target = agents.find((a) => a.id === id);
      if (!target) return;
      const updated: DomainAgent = {
        ...target,
        enabled: !target.enabled,
        updatedAt: Date.now(),
      };
      await agentRepository.save(updated);
      await refreshAgents();
    },
    [agents, refreshAgents],
  );

  const getAgentHandle = useCallback(
    (id?: string) => {
      if (!id) return "";
      const agent = agents.find((a) => a.id === id);
      return agent ? agent.handle : id;
    },
    [agents],
  );

  return {
    agents,
    enabledAgents,
    loading,
    saveAgent,
    deleteAgent,
    toggleAgent,
    refreshAgents,
    getAgentHandle,
  };
}

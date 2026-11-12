import { useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  executePlannerAgent,
  type AgentResult,
  type PlannerAgentStore,
} from "../utils/plannerAgent";
import { flushPendingStorage } from "../utils/deferredStorage";
import { storage } from "../utils/unifiedStorage";
import { journalRepository, taskRepository } from "../data/repositories";

interface Job {
  id: string;
  expiresAt: number;
  call: { operation: string; arguments: unknown };
}

const storageKeys: Record<string, string> = {
  create_task: "aero_todos",
  create_note: "aero_sticky_notes",
  create_journal: "tongyun_journal",
};

export function usePlannerAgent(isMain: boolean, ready: boolean, store: PlannerAgentStore) {
  const latest = useRef(store);
  useLayoutEffect(() => {
    latest.current = store;
  }, [store]);

  useEffect(() => {
    if (!isMain || !ready || !("__TAURI_INTERNALS__" in window)) return;
    let active = true;
    let inFlight = false;
    const subscribed = listen<Job>(
      "planner-agent-call",
      async ({ payload }) => {
        if (!active) return;
        let result: AgentResult = { status: "unavailable" };
        if (!inFlight && payload.expiresAt > Date.now()) {
          inFlight = true;
          try {
            const { operation, arguments: args } = payload.call;
            const key = storageKeys[operation];
            if (key) {
              if (storage.isMirrorReady()) {
                // Commit any open journal draft before checking whether that day already exists.
                flushSync(flushPendingStorage);
                result = flushSync(() => executePlannerAgent(latest.current, operation, args));
                if (result.status === "ok") {
                  const { id } = result.data as { id: string };
                  flushPendingStorage();
                  if (operation === "create_task") await taskRepository.flushPendingWrites();
                  if (operation === "create_journal") await journalRepository.flushPendingWrites();
                  await storage.flushNow();
                  const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
                  const hasItem = Array.isArray(saved) && saved.some((item) => item?.id === id);
                  // Journal hydration prefers the domain table over the storage mirror.
                  const hasJournal =
                    operation !== "create_journal" ||
                    (await journalRepository.load())?.some((entry) => entry.id === id);
                  if (!hasItem || !hasJournal || storage.hasPendingMirrorWrite(key))
                    result = { status: "unknown" };
                }
              }
            } else {
              result = executePlannerAgent(latest.current, operation, args);
            }
          } catch {
            result = { status: "unknown" };
          } finally {
            inFlight = false;
          }
        }
        await invoke("agent_api_finish", { id: payload.id, result }).catch(() => {});
      },
      { target: "main" },
    );
    return () => {
      active = false;
      void subscribed.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [isMain, ready]);
}
